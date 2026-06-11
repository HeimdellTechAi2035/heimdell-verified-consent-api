import type { Role } from "@prisma/client";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { hashValue } from "@/lib/crypto";

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
  input: ClientProvisioningInput
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
}): Promise<ClientProvisioningResult> {
  const { input, externalAuthId, adminName, membershipRole, existingUserId } = params;

  return db.$transaction(async (tx) => {
    const organization = await tx.organization.create({
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
