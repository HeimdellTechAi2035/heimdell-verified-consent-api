"use server";

import { redirect } from "next/navigation";
import {
  assertProvisioningRecordsAvailable,
  buildClientProvisioningInput,
  createProvisionedClientOrganization,
  type ClientAdminAvailability,
  PLATFORM_PROVISIONING_ROLES,
  validateClientProvisioningInput,
} from "@/lib/dashboard-client-provisioning";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { logDashboardAuditEvent } from "@/lib/dashboard-audit";

const ERROR_REDIRECTS: Record<string, string> = {
  invalid_input: "/dashboard/clients/new?error=invalid-input",
  organization_slug_exists: "/dashboard/clients/new?error=organization-exists",
  client_admin_exists: "/dashboard/clients/new?error=user-exists",
  client_admin_active_membership: "/dashboard/clients/new?error=active-user",
  supabase_not_configured: "/dashboard/clients/new?error=supabase-not-configured",
  supabase_user_create_failed: "/dashboard/clients/new?error=supabase-user-create-failed",
  provisioning_failed: "/dashboard/clients/new?error=provisioning-failed",
};

export async function provisionClientCompany(formData: FormData) {
  const context = await requireDashboardRole(PLATFORM_PROVISIONING_ROLES);

  const input = buildClientProvisioningInput(formData);
  const validationErrors = validateClientProvisioningInput(input);

  if (validationErrors.length > 0) {
    redirect(ERROR_REDIRECTS.invalid_input);
  }

  let adminAvailability: ClientAdminAvailability;

  try {
    adminAvailability = await assertProvisioningRecordsAvailable(input);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "client_admin_active_membership"
    ) {
      await logDashboardAuditEvent({
        organizationId: context.organization.id,
        userId: context.user.id,
        action: "client_admin_email_blocked_active_membership",
        entityType: "user",
      });
    }

    redirectForProvisioningError(error);
  }

  let externalAuthId: string;
  let reusedAuthUser = false;
  let tempPasswordReset = false;

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
            provisionedBy: "heimdell-dashboard",
          },
        }
      );

      if (error) {
        console.error("[client-provisioning] Supabase user update failed", {
          message: error.message,
          status: error.status,
          name: error.name,
        });
        redirect(ERROR_REDIRECTS.supabase_user_create_failed);
      }

      externalAuthId = existingAuthUser.id;
      reusedAuthUser = true;
      tempPasswordReset = true;
    } else {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: input.clientAdminEmail,
        password: input.temporaryPassword,
        email_confirm: true,
        user_metadata: {
          name: input.primaryContactName,
          provisionedBy: "heimdell-dashboard",
        },
      });

      if (error || !data.user) {
        console.error("[client-provisioning] Supabase user creation failed", {
          message: error?.message,
          status: error?.status,
          name: error?.name,
        });
        redirect(ERROR_REDIRECTS.supabase_user_create_failed);
      }

      externalAuthId = data.user.id;
    }
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("[client-provisioning] Supabase admin setup failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    redirect(ERROR_REDIRECTS.supabase_not_configured);
  }

  let result: Awaited<ReturnType<typeof createProvisionedClientOrganization>>;

  try {
    result = await createProvisionedClientOrganization({
      input,
      externalAuthId,
      adminName: input.primaryContactName,
      existingUserId:
        adminAvailability.status === "reuse_internal_user"
          ? adminAvailability.userId
          : null,
    });
  } catch (error) {
    console.error("[client-provisioning] Internal provisioning failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    redirect(ERROR_REDIRECTS.provisioning_failed);
  }

  await Promise.all([
    result.reusedInternalUser
      ? logDashboardAuditEvent({
          organizationId: result.organizationId,
          userId: context.user.id,
          action: "client_admin_user_reused",
          entityType: "user",
          entityId: result.userId,
        })
      : Promise.resolve(),
    reusedAuthUser
      ? logDashboardAuditEvent({
          organizationId: result.organizationId,
          userId: context.user.id,
          action: "client_admin_auth_user_reused",
          entityType: "user",
          entityId: result.userId,
        })
      : Promise.resolve(),
    tempPasswordReset
      ? logDashboardAuditEvent({
          organizationId: result.organizationId,
          userId: context.user.id,
          action: "client_admin_temp_password_reset",
          entityType: "user",
          entityId: result.userId,
        })
      : Promise.resolve(),
  ]);

  redirect(
    result.reusedInternalUser
      ? "/dashboard/clients?provisioned=reused-user"
      : "/dashboard/clients?provisioned=1"
  );
}

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

function redirectForProvisioningError(error: unknown): never {
  if (error instanceof Error && error.message in ERROR_REDIRECTS) {
    redirect(ERROR_REDIRECTS[error.message]);
  }

  redirect(ERROR_REDIRECTS.provisioning_failed);
}

function isRedirectError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}
