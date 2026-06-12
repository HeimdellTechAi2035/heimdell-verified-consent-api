import Link from "next/link";
import type { ReactNode } from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { requireOrganizationMembership } from "@/lib/dashboard-auth";
import {
  getDashboardVerificationDetail,
  type DashboardVerificationDetail,
} from "@/lib/dashboard-verifications";

type VerificationDetailPageProps = {
  params: Promise<{ id: string }>;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gray-900">{value ?? "Not recorded"}</dd>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function VerificationDetail({ detail }: { detail: DashboardVerificationDetail }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800">
        <span className="font-semibold">Safe verification evidence.</span>{" "}
        Secure link internals are never shown here.
      </div>

      {detail.verificationStatus === "PENDING" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The pending verification URL is shown only on the New Verification success screen because it is a sensitive secure link.
        </div>
      )}

      <Section title="Outcome">
        <dl className="grid gap-5 md:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Verification status</dt>
            <dd className="mt-1"><StatusBadge status={detail.verificationStatus} /></dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Sale status</dt>
            <dd className="mt-1"><StatusBadge status={detail.saleStatus} /></dd>
          </div>
          <Field label="Client reference" value={detail.clientReference} />
          <Field label="Created" value={formatDateTime(detail.createdAt)} />
          <Field label="Opened" value={formatDateTime(detail.openedAt)} />
          <Field label="Completed" value={formatDateTime(detail.completedAt)} />
          <Field label="Declined" value={formatDateTime(detail.declinedAt)} />
          <Field label="Expires" value={formatDateTime(detail.expiresAt)} />
          <Field label="Verification reference" value={detail.id} />
        </dl>
      </Section>

      <Section title="Customer and seller">
        <dl className="grid gap-5 md:grid-cols-2">
          <Field label="Customer name" value={detail.customerName} />
          <Field label="Customer phone" value={detail.customerPhone} />
          <Field label="Customer email" value={detail.customerEmail} />
          <Field label="Customer address" value={detail.customerAddress} />
          <Field label="Seller name" value={detail.sellerName} />
          <Field label="Seller email" value={detail.sellerEmail} />
        </dl>
      </Section>

      <Section title="Product">
        <dl className="grid gap-5 md:grid-cols-2">
          <Field label="Product" value={detail.productName} />
          <Field label="Price" value={detail.priceSummary} />
          <Field label="Terms summary" value={detail.termsSummary} />
          <Field label="Policies summary" value={detail.policiesSummary} />
        </dl>
      </Section>

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/dashboard/sales/${encodeURIComponent(detail.saleId)}`}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700"
        >
          View sale
        </Link>
        {detail.certificateId && (
          <Link
            href={`/dashboard/certificates/${encodeURIComponent(detail.certificateId)}`}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            View certificate
          </Link>
        )}
      </div>
    </div>
  );
}

async function VerificationDetailContent({ id }: { id: string }) {
  const context = await requireOrganizationMembership();
  const detail = await getDashboardVerificationDetail(context, id);

  return (
    <>
      <div className="mb-5">
        <Link href="/dashboard/verifications" className="text-sm font-semibold text-blue-600">
          Back to Verifications
        </Link>
      </div>
      <DashboardHeader
        title="Verification evidence"
        subtitle="Customer, seller, product, status, and certificate links."
      />
      {detail ? (
        <VerificationDetail detail={detail} />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">Verification not available</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-gray-500">
            This verification could not be found for your organization.
          </p>
        </div>
      )}
    </>
  );
}

export default async function VerificationDetailPage({
  params,
}: VerificationDetailPageProps) {
  const { id } = await params;

  return (
    <DashboardRoleGate section="verifications">
      <VerificationDetailContent id={id} />
    </DashboardRoleGate>
  );
}


