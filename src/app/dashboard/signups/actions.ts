"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import { logDashboardAuditEvent } from "@/lib/dashboard-audit";
import {
  approveOrganizationSignup,
  PLATFORM_PROVISIONING_ROLES,
  rejectOrganizationSignup,
} from "@/lib/dashboard-client-provisioning";

export type ApproveSignupActionResult =
  | {
      ok: true;
      result: {
        organizationId: string;
        temporaryPassword: string;
        loginUrl: string;
        emailSent: boolean;
      };
    }
  | { ok: false; message: string };

function getApprovalErrorMessage(reason: string): string {
  switch (reason) {
    case "not_found":
      return "Signup application was not found.";
    case "not_pending":
      return "This application has already been reviewed.";
    case "missing_contact_details":
      return "This application is missing contact details.";
    case "client_admin_active_membership":
      return "That email is already linked to an active Heimdell account.";
    case "supabase_user_update_failed":
    case "supabase_user_create_failed":
    case "supabase_not_configured":
      return "Could not create the login. Check Supabase admin configuration.";
    case "provisioning_failed":
      return "Approval failed while creating internal records.";
    default:
      return "Approval failed.";
  }
}

export async function approveSignupAction(
  _prevState: ApproveSignupActionResult | null,
  formData: FormData
): Promise<ApproveSignupActionResult> {
  const context = await requireDashboardRole(PLATFORM_PROVISIONING_ROLES);
  const organizationId = String(formData.get("organizationId") ?? "").trim();

  if (!organizationId) {
    return { ok: false, message: "Select a pending signup to approve." };
  }

  const result = await approveOrganizationSignup({
    organizationId,
    approvedByUserId: context.user.id,
  });

  if (!result.ok) {
    return { ok: false, message: getApprovalErrorMessage(result.reason) };
  }

  await logDashboardAuditEvent({
    organizationId: result.organizationId,
    userId: context.user.id,
    action: "signup_approved",
    entityType: "organization",
    entityId: result.organizationId,
    metadata: { emailSent: result.emailSent },
  });

  revalidatePath("/dashboard/signups");
  revalidatePath("/dashboard/clients");

  return {
    ok: true,
    result: {
      organizationId: result.organizationId,
      temporaryPassword: result.temporaryPassword,
      loginUrl: result.loginUrl,
      emailSent: result.emailSent,
    },
  };
}

export async function rejectSignupAction(formData: FormData) {
  const context = await requireDashboardRole(PLATFORM_PROVISIONING_ROLES);
  const organizationId = String(formData.get("organizationId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || "Not specified";

  if (!organizationId) {
    redirect("/dashboard/signups?error=missing-organization");
  }

  const result = await rejectOrganizationSignup({ organizationId, reason });

  if (!result.ok) {
    redirect("/dashboard/signups?error=reject-failed");
  }

  await logDashboardAuditEvent({
    organizationId,
    userId: context.user.id,
    action: "signup_rejected",
    entityType: "organization",
    entityId: organizationId,
    metadata: { reason },
  });

  revalidatePath("/dashboard/signups");
  redirect("/dashboard/signups?rejected=1");
}
