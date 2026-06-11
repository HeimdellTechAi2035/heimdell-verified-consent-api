import type { Metadata } from "next";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { VerificationForm } from "@/components/dashboard/VerificationForm";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import { createSellerVerificationAction } from "./actions";

export const metadata: Metadata = {
  title: "New Verification - Heimdell",
};

const SELLER_VERIFICATION_ROLES = ["SELLER"] as const;

export default async function NewSellerVerificationPage() {
  await requireDashboardRole(SELLER_VERIFICATION_ROLES);

  return (
    <>
      <DashboardHeader
        title="New Verification"
        subtitle="Enter the customer and sale details, then send a secure verification link."
        action={
          <Link
            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            href="/dashboard/my-sales"
          >
            Back to My Sales
          </Link>
        }
      />

      <VerificationForm
        action={createSellerVerificationAction}
        backHref="/dashboard/my-sales"
        backLabel="Back to My Sales"
        mode="seller"
      />
    </>
  );
}
