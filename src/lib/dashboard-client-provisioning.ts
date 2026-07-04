import type { Role } from "@prisma/client";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { hashValue } from "@/lib/crypto";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { generateTemporaryStaffPassword } from "@/lib/dashboard-staff";
import { sendEmailNotification } from "@/lib/notification-providers";

export const PLATFORM_PROVISIONING_ROLES = [
  "PLATFORM_ADMIN",
  "OWNER",
] as const satisfies readonly Role[];

export type ClientProvisioningInput = {
  organizationName: string;
  organizationSlug: string;
  primaryContactName: string;
  primaryContactEmail: string;
  clientAdminEmail: string;
  temporaryPassword: string;
  primaryContactPhone?: string;
  notes?: string;
};

export type ClientProvisioningResult = {
  organizationId: string;
  clientId: string;
  userId: string;
  membershipRole: Role;
  reusedInternalUser: boolean;
};

export type ClientAdminAvailability =
  | { status: "available" }
  | { status: "reuse_internal_user"; userId: string }
  | { status: "blocked_active_membership"; userId: string };

export function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function buildClientProvisioningInput(formData: FormData): ClientProvisioningInput {
  return {
    organizationName: String(formData.get("organizationName") ?? "").trim(),
    organizationSlug: normalizeSlug(String(formData.get("organizationSlug") ?? "")),
    primaryContactName: String(formData.get("primaryContactName") ?? "").trim(),
    primaryContactEmail: String(formData.get("primaryContactEmail") ?? "")
      .trim()
      .toLowerCase(),
    clientAdminEmail: String(formData.get("clientAdminEmail") ?? "")
      .trim()
      .toLowerCase(),
    temporaryPassword: String(formData.get("temporaryPassword") ?? ""),
    primaryContactPhone: String(formData.get("primaryContactPhone") ?? "").trim() || undefined,
    notes: String(formData.get("notes") ?? "").trim() || undefined,
  };
}

export function validateClientProvisioningInput(
  input: ClientProvisioningInput
): string[] {
  const errors: string[] = [];

  if (!input.organizationName) {
    errors.push("Company / organization name is required.");
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.organizationSlug)) {
    errors.push("Organization slug must contain lowercase letters, numbers, and hyphens only.");
  }

  if (!input.primaryContactName) {
    errors.push("Primary contact name is required.");
  }

  if (!isValidEmail(input.primaryContactEmail)) {
    errors.push("Primary contact email must be valid.");
  }

  if (!isValidEmail(input.clientAdminEmail)) {
    errors.push("Client admin email must be valid.");
  }

  if (input.temporaryPassword.length < 12) {
    errors.push("Temporary password must be at least 12 characters.");
  }

  return errors;
}

export async function getClientAdminAvailability(
  input: { clientAdminEmail: string }
): Promise<ClientAdminAvailability> {
  const existingUser = await db.user.findUnique({
    where: { email: input.clientAdminEmail },
    select: {
      id: true,
      memberships: {
        where: {
          organization: {
            archivedAt: null,
          },
        },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!existingUser) {
    return { status: "available" };
  }

  if (existingUser.memberships.length > 0) {
    return { status: "blocked_active_membership", userId: existingUser.id };
  }

  return { status: "reuse_internal_user", userId: existingUser.id };
}

export async function assertProvisioningRecordsAvailable(
  input: ClientProvisioningInput
): Promise<ClientAdminAvailability> {
  const [existingOrganization, adminAvailability] = await Promise.all([
    db.organization.findUnique({
      where: { slug: input.organizationSlug },
      select: { id: true },
    }),
    getClientAdminAvailability(input),
  ]);

  if (existingOrganization) {
    throw new Error("organization_slug_exists");
  }

  if (adminAvailability.status === "blocked_active_membership") {
    throw new Error("client_admin_active_membership");
  }

  return adminAvailability;
}

export async function createProvisionedClientOrganization(params: {
  input: ClientProvisioningInput;
  externalAuthId: string;
  adminName?: string | null;
  existingUserId?: string | null;
  /** Set when approving a self-serve signup: updates this org instead of creating a new one. */
  existingOrganizationId?: string | null;
  approvedByUserId?: string | null;
}): Promise<ClientProvisioningResult> {
  try {
    return await createProvisioningRecords({
      ...params,
      membershipRole: "CLIENT_OWNER",
    });
  } catch (error) {
    if (!looksLikeUnavailableClientOwnerRole(error)) {
      throw error;
    }

    return createProvisioningRecords({
      ...params,
      membershipRole: "ADMIN",
    });
  }
}

async function createProvisioningRecords(params: {
  input: ClientProvisioningInput;
  externalAuthId: string;
  adminName?: string | null;
  membershipRole: Role;
  existingUserId?: string | null;
  existingOrganizationId?: string | null;
  approvedByUserId?: string | null;
}): Promise<ClientProvisioningResult> {
  const {
    input,
    externalAuthId,
    adminName,
    membershipRole,
    existingUserId,
    existingOrganizationId,
    approvedByUserId,
  } = params;

  return db.$transaction(async (tx) => {
    const organization = existingOrganizationId
      ? await tx.organization.update({
          where: { id: existingOrganizationId },
          data: {
            name: input.organizationName,
            slug: input.organizationSlug,
            primaryContactName: input.primaryContactName,
            primaryContactEmail: input.primaryContactEmail,
            primaryContactPhone: input.primaryContactPhone,
            notes: input.notes,
            onboardingStatus: "APPROVED",
            approvedAt: new Date(),
            approvedByUserId,
          },
          select: { id: true },
        })
      : await tx.organization.create({
          data: {
            name: input.organizationName,
            slug: input.organizationSlug,
            primaryContactName: input.primaryContactName,
            primaryContactEmail: input.primaryContactEmail,
            primaryContactPhone: input.primaryContactPhone,
            notes: input.notes,
          },
          select: { id: true },
        });

    const placeholderApiKeyHash = await hashValue(
      generateLegacyClientPlaceholderSecret()
    );
    const client = await tx.client.create({
      data: {
        organizationId: organization.id,
        name: `${input.organizationName} Client`,
        apiKeyHash: placeholderApiKeyHash,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    const user = existingUserId
      ? await tx.user.update({
          where: { id: existingUserId },
          data: {
            externalAuthId,
            email: input.clientAdminEmail,
            name: adminName ?? input.primaryContactName,
            mustChangePassword: true,
          },
          select: { id: true },
        })
      : await tx.user.create({
          data: {
            externalAuthId,
            email: input.clientAdminEmail,
            name: adminName ?? input.primaryContactName,
            mustChangePassword: true,
          },
          select: { id: true },
        });

    const membership = await tx.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: membershipRole,
      },
      select: { role: true },
    });

    return {
      organizationId: organization.id,
      clientId: client.id,
      userId: user.id,
      membershipRole: membership.role,
      reusedInternalUser: Boolean(existingUserId),
    };
  });
}

export function generateLegacyClientPlaceholderSecret(): string {
  return `hvcs_placeholder_${randomBytes(32).toString("base64url")}`;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ---------------------------------------------------------------------------
// Self-serve signup approval — reuses everything above via
// createProvisionedClientOrganization({..., existingOrganizationId}).
// ---------------------------------------------------------------------------

export type ApproveOrganizationSignupResult =
  | {
      ok: true;
      organizationId: string;
      temporaryPassword: string;
      loginUrl: string;
      emailSent: boolean;
    }
  | { ok: false; reason: string };

function buildClientLoginUrl(): string {
  const appUrl = process.env.APP_URL?.trim().replace(/\/$/, "");
  return appUrl ? `${appUrl}/login/client` : "/login/client";
}

function buildApprovalEmailBody(params: {
  email: string;
  temporaryPassword: string;
  loginUrl: string;
}): string {
  return [
    `Your Heimdell dashboard account is ready.`,
    ``,
    `Login URL: ${params.loginUrl}`,
    `Email: ${params.email}`,
    `Temporary password: ${params.temporaryPassword}`,
    ``,
    `You will be asked to set a new password the first time you log in.`,
    `Do not share this email or forward it — treat the temporary password like any other credential.`,
  ].join("\n");
}

/**
 * Mirrors the create-or-reuse Supabase Auth user block in
 * src/app/dashboard/clients/new/actions.ts (kept as a small, deliberate
 * duplication rather than a shared import, since that file is the
 * human-driven manual flow and this is the automated approval flow --
 * see plan notes on why organization-signup.ts stays separate too).
 */
async function findSupabaseAuthUserByEmail(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  email: string
) {
  const normalizedEmail = email.trim().toLowerCase();
  let page = 1;

  while (page <= 20) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 100,
    });

    if (error) {
      throw error;
    }

    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === normalizedEmail
    );

    if (user) {
      return user;
    }

    if (data.users.length < 100) {
      return null;
    }

    page += 1;
  }

  return null;
}

export async function approveOrganizationSignup(params: {
  organizationId: string;
  approvedByUserId: string;
}): Promise<ApproveOrganizationSignupResult> {
  const organization = await db.organization.findUnique({
    where: { id: params.organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      primaryContactName: true,
      primaryContactEmail: true,
      primaryContactPhone: true,
      notes: true,
      onboardingStatus: true,
    },
  });

  if (!organization) {
    return { ok: false, reason: "not_found" };
  }

  if (organization.onboardingStatus !== "PENDING_APPROVAL") {
    return { ok: false, reason: "not_pending" };
  }

  if (!organization.primaryContactEmail || !organization.primaryContactName) {
    return { ok: false, reason: "missing_contact_details" };
  }

  const input: ClientProvisioningInput = {
    organizationName: organization.name,
    organizationSlug: organization.slug,
    primaryContactName: organization.primaryContactName,
    primaryContactEmail: organization.primaryContactEmail,
    clientAdminEmail: organization.primaryContactEmail,
    temporaryPassword: generateTemporaryStaffPassword(),
    primaryContactPhone: organization.primaryContactPhone ?? undefined,
    notes: organization.notes ?? undefined,
  };

  // Time has passed since submission -- re-check, don't trust signup-time state.
  const adminAvailability = await getClientAdminAvailability(input);
  if (adminAvailability.status === "blocked_active_membership") {
    return { ok: false, reason: "client_admin_active_membership" };
  }

  let externalAuthId: string;

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const existingAuthUser = await findSupabaseAuthUserByEmail(
      supabaseAdmin,
      input.clientAdminEmail
    );

    if (existingAuthUser) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(
        existingAuthUser.id,
        {
          password: input.temporaryPassword,
          email_confirm: true,
          user_metadata: {
            ...(existingAuthUser.user_metadata ?? {}),
            name: input.primaryContactName,
            provisionedBy: "heimdell-signup-approval",
          },
        }
      );

      if (error) {
        console.error("[signup-approval] Supabase user update failed", {
          message: error.message,
        });
        return { ok: false, reason: "supabase_user_update_failed" };
      }

      externalAuthId = existingAuthUser.id;
    } else {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: input.clientAdminEmail,
        password: input.temporaryPassword,
        email_confirm: true,
        user_metadata: {
          name: input.primaryContactName,
          provisionedBy: "heimdell-signup-approval",
        },
      });

      if (error || !data.user) {
        console.error("[signup-approval] Supabase user creation failed", {
          message: error?.message,
        });
        return { ok: false, reason: "supabase_user_create_failed" };
      }

      externalAuthId = data.user.id;
    }
  } catch (error) {
    console.error("[signup-approval] Supabase admin setup failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return { ok: false, reason: "supabase_not_configured" };
  }

  let result: ClientProvisioningResult;

  try {
    result = await createProvisionedClientOrganization({
      input,
      externalAuthId,
      adminName: input.primaryContactName,
      existingUserId:
        adminAvailability.status === "reuse_internal_user"
          ? adminAvailability.userId
          : null,
      existingOrganizationId: organization.id,
      approvedByUserId: params.approvedByUserId,
    });
  } catch (error) {
    console.error("[signup-approval] Internal provisioning failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return { ok: false, reason: "provisioning_failed" };
  }

  const loginUrl = buildClientLoginUrl();

  // The temp password is returned to the caller regardless of email outcome
  // (see ApproveOrganizationSignupResult) -- if sending fails, there is no
  // human who was already holding it to relay manually, unlike the fully
  // manual flow, so the approval UI must show it on-screen as a fallback.
  let emailSent = false;
  try {
    const emailResult = await sendEmailNotification({
      recipient: input.clientAdminEmail,
      subject: "Your Heimdell dashboard login",
      body: buildApprovalEmailBody({
        email: input.clientAdminEmail,
        temporaryPassword: input.temporaryPassword,
        loginUrl,
      }),
    });
    emailSent = emailResult.status === "sent";
  } catch (error) {
    console.error("[signup-approval] login email send threw", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }

  return {
    ok: true,
    organizationId: result.organizationId,
    temporaryPassword: input.temporaryPassword,
    loginUrl,
    emailSent,
  };
}

export async function rejectOrganizationSignup(params: {
  organizationId: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const organization = await db.organization.findUnique({
    where: { id: params.organizationId },
    select: { onboardingStatus: true },
  });

  if (!organization) {
    return { ok: false, reason: "not_found" };
  }

  if (organization.onboardingStatus !== "PENDING_APPROVAL") {
    return { ok: false, reason: "not_pending" };
  }

  await db.organization.update({
    where: { id: params.organizationId },
    data: {
      onboardingStatus: "REJECTED",
      rejectedAt: new Date(),
      rejectionReason: params.reason,
    },
  });

  return { ok: true };
}

export type PendingOrganizationSignup = {
  organizationId: string;
  name: string;
  slug: string;
  companiesHouseNumber: string | null;
  icoRegistrationNumber: string | null;
  businessAddress: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  createdAt: string;
};

export async function getPendingOrganizationSignups(): Promise<PendingOrganizationSignup[]> {
  const organizations = await db.organization.findMany({
    where: { onboardingStatus: "PENDING_APPROVAL" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      companiesHouseNumber: true,
      icoRegistrationNumber: true,
      businessAddress: true,
      primaryContactName: true,
      primaryContactEmail: true,
      primaryContactPhone: true,
      createdAt: true,
    },
  });

  return organizations.map((organization) => ({
    organizationId: organization.id,
    name: organization.name,
    slug: organization.slug,
    companiesHouseNumber: organization.companiesHouseNumber,
    icoRegistrationNumber: organization.icoRegistrationNumber,
    businessAddress: organization.businessAddress,
    primaryContactName: organization.primaryContactName,
    primaryContactEmail: organization.primaryContactEmail,
    primaryContactPhone: organization.primaryContactPhone,
    createdAt: organization.createdAt.toISOString(),
  }));
}

function looksLikeUnavailableClientOwnerRole(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("CLIENT_OWNER") ||
    error.message.includes("invalid input value for enum") ||
    error.message.includes("Role")
  );
}
