import Link from "next/link";
import type { ReactNode } from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { requireOrganizationMembership } from "@/lib/dashboard-auth";
import {
  getDashboardSaleDetail,
  type DashboardSaleDetail,
} from "@/lib/dashboard-sales";

type SaleDetailPageProps = {
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

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </dt>
      <dd className={`mt-1 text-sm text-gray-900 ${mono ? "font-mono break-all" : ""}`}>
        {value ?? "Not recorded"}
      </dd>
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

function NotFoundState() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">Sale not available</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-gray-500">
        This sale could not be found for your organization, or your role does not allow access to it.
      </p>
      <Link
        href="/dashboard/sales"
        className="mt-5 inline-flex rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700"
      >
        Back to Sales
      </Link>
    </div>
  );
}

function PendingLinkNotice() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      The original verification link is sensitive and is only shown at creation time. It is not stored, so this dashboard cannot safely copy it later.
    </div>
  );
}

function SaleDetail({ detail }: { detail: DashboardSaleDetail }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800">
        <span className="font-semibold">Safe dashboard evidence.</span>{" "}
        This page excludes secure link internals, full account numbers, and encrypted payment values.
      </div>

      {detail.latestVerificationStatus === "PENDING" && <PendingLinkNotice />}

      <Section title="Customer">
        <dl className="grid gap-5 md:grid-cols-2">
          <Field label="Full name" value={detail.customerName} />
          <Field label="Phone" value={detail.customerPhone} />
          <Field label="Email" value={detail.customerEmail} />
          <Field label="Address" value={detail.customerAddress} />
        </dl>
      </Section>

      <Section title="Seller and reference">
        <dl className="grid gap-5 md:grid-cols-3">
          <Field label="Seller name" value={detail.sellerName} />
          <Field label="Seller email" value={detail.sellerEmail} />
          <Field label="Client reference" value={detail.clientReference} />
          <Field label="Sale reference" value={detail.saleReference} mono />
          <Field label="Created" value={formatDateTime(detail.createdAt)} />
          <Field label="Updated" value={formatDateTime(detail.updatedAt)} />
        </dl>
      </Section>

      <Section title="Product and sale">
        <dl className="grid gap-5 md:grid-cols-3">
          <Field label="Product" value={detail.productName} />
          <Field label="Price" value={detail.priceSummary} />
          <Field label="Sales channel" value={detail.salesChannel} />
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Sale status</dt>
            <dd className="mt-1"><StatusBadge status={detail.saleStatus} /></dd>
          </div>
          <Field
            label="Cooling-off"
            value={detail.coolingOffDays == null ? null : `${detail.coolingOffDays} days`}
          />
          <Field
            label="AI marketing"
            value={detail.aiMarketingOptIn == null ? "Not collected" : detail.aiMarketingOptIn ? "Opted in" : "Opted out"}
          />
        </dl>
      </Section>

      <Section title="Verification">
        <div className="space-y-4">
          {detail.verifications.length === 0 ? (
            <p className="text-sm text-gray-500">No verification sessions yet.</p>
          ) : (
            detail.verifications.map((session) => (
              <div key={session.id} className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-mono text-xs text-gray-500">{session.id}</p>
                    <div className="mt-2"><StatusBadge status={session.status} /></div>
                  </div>
                  <div className="text-xs text-gray-500">
                    <p>Created: {formatDateTime(session.createdAt)}</p>
                    <p>Completed: {formatDateTime(session.completedAt)}</p>
                    <p>Declined: {formatDateTime(session.declinedAt)}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Link className="text-xs font-semibold text-blue-600" href={`/dashboard/verifications/${encodeURIComponent(session.id)}`}>
                      View verification
                    </Link>
                    {session.certificateId && (
                      <Link className="text-xs font-semibold text-green-700" href={`/dashboard/certificates/${encodeURIComponent(session.certificateId)}`}>
                        View certificate
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Section>

      <Section title="Payment summary">
        <dl className="grid gap-5 md:grid-cols-2">
          <Field label="Bank" value={detail.payment?.bankName ?? null} />
          <Field label="Sort code" value={detail.payment?.sortCodeMasked ?? null} />
          <Field label="Account" value={detail.payment?.accountEnding ?? null} />
          <Field label="Account holder" value={detail.payment?.accountHolderName ?? null} />
        </dl>
      </Section>

      <Section title="Terms and policies">
        <dl className="space-y-5">
          <Field label="Subscription terms summary" value={detail.termsSummary} />
          <Field label="Policies summary" value={detail.policiesSummary} />
        </dl>
      </Section>
    </div>
  );
}

async function SaleDetailContent({ id }: { id: string }) {
  const context = await requireOrganizationMembership();
  const detail = await getDashboardSaleDetail(context, id);

  return (
    <>
      <div className="mb-5">
        <Link href="/dashboard/sales" className="text-sm font-semibold text-blue-600">
          Back to Sales
        </Link>
      </div>
      <DashboardHeader
        title="Sale evidence"
        subtitle="Customer, seller, verification, and safe payment summary."
      />
      {detail ? <SaleDetail detail={detail} /> : <NotFoundState />}
    </>
  );
}

export default async function SaleDetailPage({ params }: SaleDetailPageProps) {
  const { id } = await params;

  return (
    <DashboardRoleGate section="sales">
      <SaleDetailContent id={id} />
    </DashboardRoleGate>
  );
}


