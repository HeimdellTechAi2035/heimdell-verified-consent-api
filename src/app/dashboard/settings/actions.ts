"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import {
  saveClientPolicySettings,
  type PolicySettingsActionState,
} from "@/lib/client-policy";

const POLICY_MANAGER_ROLES = ["CLIENT_OWNER", "CLIENT_MANAGER"] as const;

export async function saveClientPolicyAction(
  _state: PolicySettingsActionState,
  formData: FormData
): Promise<PolicySettingsActionState> {
  const context = await requireDashboardRole(POLICY_MANAGER_ROLES);

  try {
    const result = await saveClientPolicySettings({ context, formData });
    if (result.status === "success") {
      revalidatePath("/dashboard/settings");
    }
    return result;
  } catch (error) {
    console.error("[policy-settings] save failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      status: "error",
      message: "Compliance policy could not be saved for this organization.",
    };
  }
}
