"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import { getAllowedDashboardRoles } from "@/lib/dashboard-role-policy";
import {
  archiveClientOrganization,
  hardDeleteTestClientOrganization,
  restoreClientOrganization,
} from "@/lib/dashboard-client-setup";

export async function archiveClientOrganizationAction(formData: FormData) {
  const returnPath = getClientsReturnPath(formData);

  try {
    const context = await requireDashboardRole(getAllowedDashboardRoles("clients"));
    const organizationId = String(formData.get("organizationId") ?? "");

    await archiveClientOrganization({ context, organizationId });
    revalidatePath("/dashboard/clients");
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirect(`${returnPath}${getQuerySeparator(returnPath)}cleanup=archive-blocked`);
  }

  redirect(`${returnPath}${getQuerySeparator(returnPath)}cleanup=archived`);
}

export async function restoreClientOrganizationAction(formData: FormData) {
  const returnPath = getClientsReturnPath(formData);

  try {
    const context = await requireDashboardRole(getAllowedDashboardRoles("clients"));
    const organizationId = String(formData.get("organizationId") ?? "");

    await restoreClientOrganization({ context, organizationId });
    revalidatePath("/dashboard/clients");
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirect(`${returnPath}${getQuerySeparator(returnPath)}cleanup=restore-blocked`);
  }

  redirect(`${returnPath}${getQuerySeparator(returnPath)}cleanup=restored`);
}

export async function hardDeleteTestClientOrganizationAction(formData: FormData) {
  const returnPath = getClientsReturnPath(formData);

  try {
    const context = await requireDashboardRole(getAllowedDashboardRoles("clients"));
    const organizationId = String(formData.get("organizationId") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");

    const result = await hardDeleteTestClientOrganization({
      context,
      organizationId,
      confirmation,
    });

    if (!result.deleted && result.blockers.length > 0) {
      redirect(`${returnPath}${getQuerySeparator(returnPath)}cleanup=delete-blocked`);
    }

    revalidatePath("/dashboard/clients");
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirect(`${returnPath}${getQuerySeparator(returnPath)}cleanup=delete-blocked`);
  }

  redirect(`${returnPath}${getQuerySeparator(returnPath)}cleanup=deleted`);
}

function getClientsReturnPath(formData: FormData): string {
  return String(formData.get("returnToArchived") ?? "") === "1"
    ? "/dashboard/clients?archived=1"
    : "/dashboard/clients";
}

function getQuerySeparator(path: string): "?" | "&" {
  return path.includes("?") ? "&" : "?";
}

function isRedirectError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}
