"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import { getAllowedDashboardRoles } from "@/lib/dashboard-role-policy";
import { grantOrganizationCredits } from "@/lib/dashboard-credits";

export type GrantCreditsActionResult =
  | { ok: true; amount: number }
  | { ok: false; message: string };

export async function grantCreditsAction(
  _prevState: GrantCreditsActionResult | null,
  formData: FormData
): Promise<GrantCreditsActionResult> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const reason = String(formData.get("reason") ?? "");

  try {
    const context = await requireDashboardRole(getAllowedDashboardRoles("clients"));
    await grantOrganizationCredits({ context, organizationId, amount, reason });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not grant credits.",
    };
  }

  revalidatePath(`/dashboard/clients/${organizationId}`);
  return { ok: true, amount: Math.floor(amount) };
}
