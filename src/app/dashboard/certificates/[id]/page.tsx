import Link from "next/link";
import type { ReactNode } from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { requireOrganizationMembership } from "@/lib/dashboard-auth";
import {
  DashboardCertificateDetailNotFoundError,
  getDashboardCertificateDetail,
  type DashboardCertificateDetail,
} from "@/lib/dashboard-certificate-detail";

type CertificateDetailPageProps = {
  params: Promise<{ id: string }>;
};

type CertificateDetailLoadResult =
  | {
      status: "loaded";
      detail: DashboardCertificateDetail;
      isSeller: boolean;
    }
  | { status: "not_found"; isSeller: boolean }
  | { status: "error"; isSeller: boolean };

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
      <dd
        className={`mt-1 text-sm text-gray-900 ${
          mono ? "font-mono break-all" : ""
        }`}
      >
        {value ?? "Not recorded"}
      </dd>
    </div>
  );
}

function TextBlock({ value }: { value: string | null }) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
      {value ?? "Not recorded"}
    </p>
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

function ConfirmationValue({ value }: { value: boolean | string | null }) {
  if (typeof value === "boolean") {
    return <StatusBadge status={value ? "CONFIRMED" : "NOT_CONFIRMED"} />;
  }

  return <span className="text-sm text-gray-700">{value ?? "Not recorded"}</span>;
}

function NotFoundState() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">
        Certificate not available
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-gray-500">
        This certificate could not be found for your organization, or your role
        does not allow access to it.
      </p>
      <Link
        href="/dashboard/certificates"
        className="mt-5 inline-flex rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700"
      >
        Back to certificates
      </Link>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="rounded-xl border border-red-100 bg-white p-8 shadow-sm">
      <h2 className="text-base font-semibold text-red-700">
        Certificate detail unavailable
      </h2>
      <p className="mt-2 text-sm text-gray-500">
        Heimdell could not load this certificate evidence summary right now. No
        sensitive details were exposed.
      </p>
    </div>
  );
}

async function loadCertificateDetail(id: string): Promise<CertificateDetailLoadResult> {
  const context = await requireOrganizationMembership();
  const isSeller = context.membership.role === "SELLER";

  try {
    return {
      status: "loaded",
      detail: await getDashboardCertificateDetail(context, id),
      isSeller,
    };
  } catch (error) {
    if (error instanceof DashboardCertificateDetailNotFoundError) {
      return { status: "not_found", isSeller };
    }

    console.error("Dashboard certificate detail load failed", {
      organizationId: context.organization.id,
      userId: context.user.id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { status: "error", isSeller };
  }
}

function CertificateEvidenceSummary({
  detail,
}: {
  detail: DashboardCertificateDetail;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800">
        <span className="font-semibold">Secure certificate evidence.</span>{" "}
        This page shows a structured certificate summary only. Export,
        download, email, raw certificate data, secure link internals, and
        full payment data remain hidden.
      </div>

      <Section title="Verification outcome">
        <dl className="grid gap-5 md:grid-cols-3">
          <Field label="Certificate ID" value={detail.id} mono />
          <Field
            label="Certificate version"
            value={detail.certificateVersion}
          />
          <Field label="Client company" value={detail.sale.clientCompanyName} />
          <Field
            label="Verification session ID"
            value={detail.verification.sessionId}
            mono
          />
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Verification status
            </dt>
            <dd className="mt-1">
              <StatusBadge status={detail.verification.status} />
            </dd>
          </div>
          <Field
            label="Created"
            value={formatDateTime(detail.verification.createdAt)}
          />
          <Field
            label="Completed"
            value={formatDateTime(detail.verification.completedAt)}
          />
          <Field
            label="Declined"
            value={formatDateTime(detail.verification.declinedAt)}
          />
          <Field
            label="Certificate created"
            value={formatDateTime(detail.createdAt)}
          />
          <Field
            label="Customer IP"
            value={detail.verification.customerIpAddress}
          />
          <Field
            label="Customer user agent"
            value={detail.verification.customerUserAgent}
          />
        </dl>
      </Section>

      <Section title="Sale details">
        <dl className="grid gap-5 md:grid-cols-3">
          <Field label="Sale ID" value={detail.sale.id} mono />
          <Field label="Client reference" value={detail.sale.clientReference} />
          <Field label="Seller name" value={detail.sale.sellerName} />
          <Field label="Seller email" value={detail.sale.sellerEmail} />
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Sale status
            </dt>
            <dd className="mt-1">
              <StatusBadge status={detail.sale.status} />
            </dd>
          </div>
          <Field label="Product" value={detail.sale.productName} />
          <Field label="Subscription price" value={detail.sale.subscriptionPrice} />
          <Field
            label="Subscription frequency"
            value={detail.sale.subscriptionFrequency}
          />
          <Field label="Contract length" value={detail.sale.contractLength} />
          <Field label="Sale channel" value={detail.sale.salesChannel} />
          <Field
            label="Cooling-off rights"
            value={detail.sale.coolingOffSummary}
          />
        </dl>
      </Section>

      <Section title="Customer">
        <dl className="grid gap-5 md:grid-cols-2">
          <Field label="Full name" value={detail.sale.customerName} />
          <Field label="Phone" value={detail.sale.customerPhone} />
          <Field label="Email" value={detail.sale.customerEmail} />
          <Field label="Address" value={detail.sale.customerAddress} />
        </dl>
      </Section>

      <Section title="Consent confirmations">
        <div className="grid gap-4 md:grid-cols-2">
          {detail.confirmations.map((confirmation) => (
            <div
              key={confirmation.label}
              className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {confirmation.label}
              </p>
              <div className="mt-2">
                <ConfirmationValue value={confirmation.value} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Terms acknowledged">
        <div className="space-y-5">
          <Field label="Terms summary" value={detail.sale.termsSummary} />
          <Field label="Policies summary" value={detail.sale.policiesSummary} />
        </div>
      </Section>

      <Section title="Policy and evidence snapshot">
        {detail.policy.isLegacyFallback && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Legacy record: this certificate was created before full policy
            snapshots were available. Heimdell is showing the best available
            summaries and default wording.
          </div>
        )}
        <div className="space-y-6">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Policy version" value={detail.policy.policyVersion} />
            <Field
              label="Policy captured"
              value={formatDateTime(detail.policy.capturedAt)}
            />
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Full Terms and Conditions
            </h3>
            <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 p-4">
              <TextBlock value={detail.policy.termsAndConditions} />
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Cooling-off Policy
            </h3>
            <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 p-4">
              <TextBlock value={detail.policy.coolingOffPolicy} />
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Cancellation Instructions
            </h3>
            <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 p-4">
              <TextBlock value={detail.policy.cancellationInstructions} />
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Privacy and Evidence Storage
            </h3>
            <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 p-4">
              <TextBlock value={detail.policy.privacyEvidenceWording} />
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Direct Debit Guarantee
            </h3>
            <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 p-4">
              <TextBlock value={detail.policy.directDebitGuaranteeWording} />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Payment confirmation summary">
        <dl className="grid gap-5 md:grid-cols-2">
          <Field
            label="Bank"
            value={detail.paymentSummary.bankName}
          />
          <Field
            label="Account"
            value={detail.paymentSummary.accountEnding}
          />
          <Field
            label="Sort code"
            value={detail.paymentSummary.sortCodeMasked}
          />
          <Field
            label="Account holder"
            value={detail.paymentSummary.accountHolderName}
          />
          <Field
            label="Mandate wording"
            value={detail.policy.directDebitGuaranteeWording}
          />
        </dl>
      </Section>

      <Section title="Timeline">
        <ol className="space-y-3">
          {detail.timeline.map((item) => (
            <li
              key={`${item.type}-${item.at}`}
              className="flex flex-col gap-1 border-l-2 border-gray-200 pl-4 md:flex-row md:items-center md:justify-between"
            >
              <span className="text-sm font-medium text-gray-800">
                {item.type}
              </span>
              <span className="text-xs text-gray-500">
                {formatDateTime(item.at)}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Integrity fingerprint">
        <dl className="space-y-4">
          <Field
            label="Proof hash fingerprint"
            value={detail.proofHashFingerprint}
            mono
          />
          <Field
            label="Full proof hash"
            value={detail.proofHash}
            mono
          />
          <Field
            label="Certificate version"
            value={detail.certificateVersion}
          />
          <Field
            label="Policy version"
            value={detail.policyVersion}
          />
        </dl>
      </Section>
    </div>
  );
}

async function CertificateDetailContent({
  id,
}: {
  id: string;
}) {
  const result = await loadCertificateDetail(id);
  const detail = result.status === "loaded" ? result.detail : null;
  const saleHref = result.isSeller
    ? `/dashboard/my-sales/${encodeURIComponent(detail?.sale.id ?? "")}`
    : `/dashboard/sales/${encodeURIComponent(detail?.sale.id ?? "")}`;

  return (
    <>
      <div className="mb-5">
        <Link
          href="/dashboard/certificates"
          className="text-sm font-semibold text-blue-600"
        >
          Back to certificates
        </Link>
      </div>

      <DashboardHeader
        title="Certificate evidence"
        subtitle="Protected certificate detail for this company."
      />

      {result.status === "not_found" ? (
        <NotFoundState />
      ) : detail ? (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4">
            <p className="text-sm text-blue-800">
              <span className="font-semibold">Protected export.</span>{" "}
              Download is available only through this authenticated dashboard
              route and contains the same safe evidence summary shown below.
            </p>
            <Link
              href={`/dashboard/certificates/${encodeURIComponent(detail.id)}/pdf`}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Download PDF
            </Link>
            <Link
              href={saleHref}
              className="rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700"
            >
              Back to Sale
            </Link>
            {!result.isSeller && (
              <Link
                href={`/dashboard/verifications/${encodeURIComponent(detail.verification.sessionId)}`}
                className="rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700"
              >
                Back to Verification
              </Link>
            )}
          </div>
          <CertificateEvidenceSummary detail={detail} />
        </>
      ) : (
        <ErrorState />
      )}
    </>
  );
}

export default async function CertificateDetailPage({
  params,
}: CertificateDetailPageProps) {
  const { id } = await params;

  return (
    <DashboardRoleGate section="certificates">
      <CertificateDetailContent id={id} />
    </DashboardRoleGate>
  );
}
