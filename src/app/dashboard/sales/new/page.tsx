import type { Metadata } from "next";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { VerificationForm } from "@/components/dashboard/VerificationForm";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import { getOrganizationSellerOptions } from "@/lib/dashboard-new-verification";
import { createManagedVerificationAction } from "./actions";

export const metadata: Metadata = {
  title: "New Verification - Heimdell",
};

const MANAGER_VERIFICATION_ROLES = ["CLIENT_OWNER", "CLIENT_MANAGER"] as const;

export default async function NewManagedVerificationPage() {
  const context = await requireDashboardRole(MANAGER_VERIFICATION_ROLES);
  const sellers = await getOrganizationSellerOptions({
    organizationId: context.organization.id,
  });

  return (
    <>
      <DashboardHeader
        title="New Verification"
        subtitle="Enter the customer and sale details, then send a secure verification link."
        action={
          <Link
            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            href="/dashboard/sales"
          >
            Back to Sales
          </Link>
        }
      />

      <VerificationForm
        action={createManagedVerificationAction}
        backHref="/dashboard/sales"
        backLabel="Back to Sales"
        mode="manager"
        sellers={sellers}
      />
    </>
  );
}
