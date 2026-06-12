"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import { logDashboardAuditEvent } from "@/lib/dashboard-audit";
import {
  generateTemporaryStaffPassword,
  markStaffPasswordChangeRequired,
  prepareStaffPasswordReset,
  type StaffPasswordResetResult,
} from "@/lib/dashboard-staff";
import { STAFF_MANAGER_ROLES } from "@/lib/dashboard-role-policy";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type StaffPasswordResetActionResult =
  | {
      ok: true;
      result: StaffPasswordResetResult;
    }
  | {
      ok: false;
      message: string;
    };

export async function resetStaffPasswordAction(
  _previousState: StaffPasswordResetActionResult | null,
  formData: FormData
): Promise<StaffPasswordResetActionResult> {
  const context = await requireDashboardRole(STAFF_MANAGER_ROLES);
  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  const targetOrganizationId = String(
    formData.get("targetOrganizationId") ?? ""
  ).trim();

  if (!targetUserId) {
    return { ok: false, message: "Select a staff user to reset." };
  }

  let resetTarget: Awaited<ReturnType<typeof prepareStaffPasswordReset>>;

  try {
    resetTarget = await prepareStaffPasswordReset({
      context,
      targetUserId,
      targetOrganizationId: targetOrganizationId || null,
    });
  } catch (error) {
    return {
      ok: false,
      message: getResetErrorMessage(error),
    };
  }

  const temporaryPassword = generateTemporaryStaffPassword();

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      resetTarget.targetUser.externalAuthId,
      {
        password: temporaryPassword,
      }
    );

    if (error) {
      console.error("[staff-password-reset] Supabase password update failed", {
        targetUserId: resetTarget.targetUser.id,
        organizationId: resetTarget.targetOrganizationId,
        message: error.message,
        status: error.status,
        name: error.name,
      });

      return {
        ok: false,
        message: "Password reset failed. Check Supabase admin configuration.",
      };
    }
  } catch (error) {
    console.error("[staff-password-reset] Supabase admin setup failed", {
      targetUserId: resetTarget.targetUser.id,
      organizationId: resetTarget.targetOrganizationId,
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return {
      ok: false,
      message: "Password reset is not configured on the server.",
    };
  }

  try {
    await markStaffPasswordChangeRequired({
      targetUserId: resetTarget.targetUser.id,
    });

    await logDashboardAuditEvent({
      organizationId: resetTarget.targetOrganizationId,
      userId: context.user.id,
      action: "staff_password_reset",
      entityType: "user",
      entityId: resetTarget.targetUser.id,
      metadata: {
        targetUserId: resetTarget.targetUser.id,
        targetRole: resetTarget.targetRole,
      },
    });

    revalidatePath("/dashboard/staff");
    revalidatePath(`/dashboard/clients/${resetTarget.targetOrganizationId}`);
  } catch (error) {
    console.error("[staff-password-reset] Internal reset update failed", {
      targetUserId: resetTarget.targetUser.id,
      organizationId: resetTarget.targetOrganizationId,
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return {
      ok: false,
      message:
        "Supabase password was updated, but Heimdell could not mark first-login password change. Contact platform support before sharing the temporary password.",
    };
  }

  return {
    ok: true,
    result: {
      targetUserId: resetTarget.targetUser.id,
      targetName: resetTarget.targetUser.name,
      targetEmail: resetTarget.targetUser.email,
      temporaryPassword,
      loginUrl: buildLoginUrl(),
    },
  };
}

function buildLoginUrl(): string {
  const appUrl = process.env.APP_URL?.trim().replace(/\/$/, "");
  return appUrl ? `${appUrl}/login` : "/login";
}

function getResetErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Password reset failed.";
  }

  switch (error.message) {
    case "staff_reset_target_not_found":
      return "Staff user was not found in your organization.";
    case "staff_reset_target_missing_auth":
      return "Staff user is missing a Supabase Auth identity.";
    case "staff_reset_not_allowed":
      return "Your role cannot reset this user's password.";
    default:
      return "Password reset failed.";
  }
}
