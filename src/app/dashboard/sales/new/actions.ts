"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import {
  createDashboardVerificationFromForm,
  type DashboardNewVerificationState,
} from "@/lib/dashboard-new-verification";

const MANAGER_VERIFICATION_ROLES = ["CLIENT_OWNER", "CLIENT_MANAGER"] as const;

export async function createManagedVerificationAction(
  _previousState: DashboardNewVerificationState,
  formData: FormData
): Promise<DashboardNewVerificationState> {
  const context = await requireDashboardRole(MANAGER_VERIFICATION_ROLES);
  const result = await createDashboardVerificationFromForm({
    context,
    formData,
  });

  if (result.status === "success") {
    revalidatePath("/dashboard/sales");
  }

  return result;
}
