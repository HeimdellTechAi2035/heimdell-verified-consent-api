"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import {
  createDashboardVerificationFromForm,
  type DashboardNewVerificationState,
} from "@/lib/dashboard-new-verification";

const SELLER_VERIFICATION_ROLES = ["SELLER"] as const;

export async function createSellerVerificationAction(
  _previousState: DashboardNewVerificationState,
  formData: FormData
): Promise<DashboardNewVerificationState> {
  const context = await requireDashboardRole(SELLER_VERIFICATION_ROLES);
  const result = await createDashboardVerificationFromForm({
    context,
    formData,
    submittedByUserId: context.user.id,
  });

  if (result.status === "success") {
    revalidatePath("/dashboard/my-sales");
  }

  return result;
}
