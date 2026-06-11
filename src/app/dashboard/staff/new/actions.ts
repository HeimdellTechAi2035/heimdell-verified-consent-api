"use server";

import { redirect } from "next/navigation";
import {
  assertStaffUserAvailable,
  buildStaffProvisioningInput,
  createStaffMembership,
  validateStaffProvisioningInput,
} from "@/lib/dashboard-staff";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import { STAFF_MANAGER_ROLES } from "@/lib/dashboard-role-policy";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const ERROR_REDIRECTS: Record<string, string> = {
  invalid_input: "/dashboard/staff/new?error=invalid-input",
  staff_user_exists: "/dashboard/staff/new?error=user-exists",
  supabase_not_configured: "/dashboard/staff/new?error=supabase-not-configured",
  supabase_user_create_failed: "/dashboard/staff/new?error=supabase-user-create-failed",
  provisioning_failed: "/dashboard/staff/new?error=provisioning-failed",
};

export async function provisionStaffUser(formData: FormData) {
  const context = await requireDashboardRole(STAFF_MANAGER_ROLES);

  if (context.organization.archivedAt) {
    redirect(ERROR_REDIRECTS.provisioning_failed);
  }

  const input = buildStaffProvisioningInput(formData);
  const validationErrors = validateStaffProvisioningInput(input);

  if (validationErrors.length > 0) {
    redirect(ERROR_REDIRECTS.invalid_input);
  }

  try {
    await assertStaffUserAvailable(input.email);
  } catch (error) {
    redirectForStaffError(error);
  }

  let externalAuthId: string;

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: input.email,
      password: input.temporaryPassword,
      email_confirm: true,
      user_metadata: {
        name: input.fullName,
        provisionedBy: "heimdell-dashboard-staff",
      },
    });

    if (error || !data.user) {
      console.error("[staff-provisioning] Supabase user creation failed", {
        message: error?.message,
        status: error?.status,
        name: error?.name,
      });
      redirect(ERROR_REDIRECTS.supabase_user_create_failed);
    }

    externalAuthId = data.user.id;
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("[staff-provisioning] Supabase admin setup failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    redirect(ERROR_REDIRECTS.supabase_not_configured);
  }

  try {
    await createStaffMembership({
      organizationId: context.organization.id,
      externalAuthId,
      input,
    });
  } catch (error) {
    console.error("[staff-provisioning] Internal staff creation failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    redirect(ERROR_REDIRECTS.provisioning_failed);
  }

  redirect("/dashboard/staff?created=1");
}

function redirectForStaffError(error: unknown): never {
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
