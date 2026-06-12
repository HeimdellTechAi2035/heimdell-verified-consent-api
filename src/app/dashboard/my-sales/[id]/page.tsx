import Link from "next/link";
import type { ReactNode } from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import { getAllowedDashboardRoles } from "@/lib/dashboard-role-policy";
import {
  getDashboardSaleDetail,
  type DashboardSaleDetail,
} from "@/lib/dashboard-sales";

type MySaleDetailPageProps = {
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

function MySaleDetail({ detail }: { detail: DashboardSaleDetail }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800">
        <span className="font-semibold">Seller-scoped evidence.</span>{" "}
        This page only loads sales submitted by your dashboard user.
      </div>

      {detail.latestVerificationStatus === "PENDING" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Verification links are sensitive and are only shown at creation time. They are not stored for later copying.
        </div>
      )}

      <Section title="Customer">
        <dl className="grid gap-5 md:grid-cols-2">
          <Field label="Full name" value={detail.customerName} />
          <Field label="Phone" value={detail.customerPhone} />
          <Field label="Email" value={detail.customerEmail} />
          <Field label="Address" value={detail.customerAddress} />
        </dl>
      </Section>

      <Section title="Sale">
        <dl className="grid gap-5 md:grid-cols-3">
          <Field label="Product" value={detail.productName} />
          <Field label="Price" value={detail.priceSummary} />
          <Field label="Client reference" value={detail.clientReference} />
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Sale status</dt>
            <dd className="mt-1"><StatusBadge status={detail.saleStatus} /></dd>
          </div>
          <Field label="Created" value={formatDateTime(detail.createdAt)} />
          <Field
            label="Completed"
            value={formatDateTime(detail.latestVerificationCompletedAt)}
          />
        </dl>
      </Section>

      <Section title="Verification">
        <div className="space-y-4">
          {detail.verifications.map((session) => (
            <div key={session.id} className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <StatusBadge status={session.status} />
                <div className="text-xs text-gray-500">
                  <p>Created: {formatDateTime(session.createdAt)}</p>
                  <p>Completed: {formatDateTime(session.completedAt)}</p>
                  <p>Declined: {formatDateTime(session.declinedAt)}</p>
                </div>
                {session.certificateId && (
                  <Link className="text-xs font-semibold text-green-700" href={`/dashboard/certificates/${encodeURIComponent(session.certificateId)}`}>
                    View certificate
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

async function MySaleDetailContent({ id }: { id: string }) {
  const context = await requireDashboardRole(getAllowedDashboardRoles("my-sales"));
  const detail = await getDashboardSaleDetail(context, id, { sellerScoped: true });

  return (
    <>
      <div className="mb-5">
        <Link href="/dashboard/my-sales" className="text-sm font-semibold text-blue-600">
          Back to My Sales
        </Link>
      </div>
      <DashboardHeader
        title="My sale evidence"
        subtitle="Customer, product, verification, and certificate status."
      />
      {detail ? (
        <MySaleDetail detail={detail} />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">Sale not available</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-gray-500">
            This sale is not assigned to your seller account, or it no longer exists.
          </p>
        </div>
      )}
    </>
  );
}

export default async function MySaleDetailPage({ params }: MySaleDetailPageProps) {
  const { id } = await params;

  return (
    <DashboardRoleGate section="my-sales">
      <MySaleDetailContent id={id} />
    </DashboardRoleGate>
  );
}


