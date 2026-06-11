// Dashboard -- Certificates page.
// Live tenant-scoped certificate metadata for the authenticated organization.

import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { DataTable, type DataTableColumn } from "@/components/dashboard/DataTable";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { requireOrganizationMembership } from "@/lib/dashboard-auth";
import {
  getDashboardCertificatesData,
  normalizeDashboardCertificateDate,
  normalizeDashboardCertificatesPage,
  normalizeDashboardCertificatesSearch,
  type DashboardCertificateRow,
  type DashboardCertificatesData,
} from "@/lib/dashboard-certificates";

type CertificatesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

const COLUMNS: DataTableColumn<DashboardCertificateRow>[] = [
  {
    header: "Certificate",
    cell: (r) => (
      <div>
        <p className="font-mono text-xs text-gray-500">{r.id}</p>
        <p className="font-mono text-xs text-gray-400 mt-0.5">
          Session {r.verificationSessionId}
        </p>
      </div>
    ),
  },
  {
    header: "Sale",
    cell: (r) => (
      <div>
        <p className="font-mono text-xs text-gray-500">{r.saleId}</p>
        <p className="font-mono text-xs text-gray-400 mt-0.5">
          {r.clientReference}
        </p>
      </div>
    ),
  },
  {
    header: "Product",
    cell: (r) => (
      <span className="text-sm font-medium text-gray-900">
        {r.productName}
      </span>
    ),
  },
  {
    header: "Verification",
    cell: (r) => <StatusBadge status={r.verificationStatus} />,
  },
  {
    header: "Sale Status",
    cell: (r) => <StatusBadge status={r.saleStatus} />,
  },
  {
    header: "Proof",
    cell: (r) => (
      <span className="font-mono text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
        {r.proofHashFingerprint}
      </span>
    ),
  },
  {
    header: "Version",
    cell: (r) => (
      <span className="text-xs text-gray-500">
        {r.certificateVersion ?? "Not recorded"}
      </span>
    ),
  },
  {
    header: "Completed",
    cell: (r) => (
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {formatDateTime(r.completedAt)}
      </span>
    ),
  },
  {
    header: "Created",
    cell: (r) => (
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {formatDateTime(r.createdAt)}
      </span>
    ),
  },
  {
    header: "Action",
    cell: (r) => (
      <Link
        className="text-xs font-semibold text-blue-600"
        href={`/dashboard/certificates/${encodeURIComponent(r.id)}`}
      >
        View certificate
      </Link>
    ),
  },
];

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildCertificatesHref(params: {
  page: number;
  search: string | null;
  createdFrom: string | null;
  createdTo: string | null;
}) {
  const query = new URLSearchParams();

  if (params.page > 1) {
    query.set("page", String(params.page));
  }

  if (params.search) {
    query.set("search", params.search);
  }

  if (params.createdFrom) {
    query.set("createdFrom", params.createdFrom);
  }

  if (params.createdTo) {
    query.set("createdTo", params.createdTo);
  }

  const queryString = query.toString();
  return queryString
    ? `/dashboard/certificates?${queryString}`
    : "/dashboard/certificates";
}

function LiveDataIndicator() {
  return (
    <div className="mb-6 flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-5 py-4">
      <svg
        className="w-5 h-5 text-green-600 shrink-0 mt-0.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </svg>
      <p className="text-sm text-green-800">
        <span className="font-semibold">Live tenant-scoped data.</span>{" "}
        Certificate metadata is loaded server-side for your organization only.
        Full certificate JSON, customer contact details, tokens, hashes, and
        payment details are not shown.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
      <h3 className="text-sm font-semibold text-gray-700">
        No certificates found
      </h3>
      <p className="text-xs text-gray-400 mt-1">
        Certificates will appear after customers complete verification sessions.
        Filters may also be hiding existing rows.
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-red-700 mb-2">
        Certificate data unavailable
      </h3>
      <p className="text-xs text-gray-500">
        Heimdell could not load live certificate metadata right now. No
        sensitive details were exposed; check the server logs and database
        connection.
      </p>
    </div>
  );
}

function FilterSummary({ data }: { data: DashboardCertificatesData }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
      <span className="font-semibold text-gray-700">Filters:</span>
      <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1">
        Reference search: {data.filters.search ?? "None"}
      </span>
      <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1">
        From: {data.filters.createdFrom ?? "Any"}
      </span>
      <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1">
        To: {data.filters.createdTo ?? "Any"}
      </span>
      {(data.filters.search ||
        data.filters.createdFrom ||
        data.filters.createdTo) && (
        <Link
          className="text-blue-600 font-semibold"
          href="/dashboard/certificates"
        >
          Clear
        </Link>
      )}
    </div>
  );
}

function PaginationControls({ data }: { data: DashboardCertificatesData }) {
  const previousHref = buildCertificatesHref({
    page: data.pagination.page - 1,
    search: data.filters.search,
    createdFrom: data.filters.createdFrom,
    createdTo: data.filters.createdTo,
  });
  const nextHref = buildCertificatesHref({
    page: data.pagination.page + 1,
    search: data.filters.search,
    createdFrom: data.filters.createdFrom,
    createdTo: data.filters.createdTo,
  });

  return (
    <div className="mt-4 flex items-center justify-between gap-4 text-xs text-gray-500">
      <span>
        Page {data.pagination.page} of {data.pagination.totalPages} ·{" "}
        {data.pagination.totalRows} certificates
      </span>
      <div className="flex items-center gap-2">
        {data.pagination.hasPreviousPage ? (
          <Link
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700"
            href={previousHref}
          >
            Previous
          </Link>
        ) : (
          <span className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-gray-300">
            Previous
          </span>
        )}
        {data.pagination.hasNextPage ? (
          <Link
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700"
            href={nextHref}
          >
            Next
          </Link>
        ) : (
          <span className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-gray-300">
            Next
          </span>
        )}
      </div>
    </div>
  );
}

async function loadCertificatesData(params: {
  page: number;
  search: string | null;
  createdFrom: string | null;
  createdTo: string | null;
}) {
  const context = await requireOrganizationMembership();

  try {
    return await getDashboardCertificatesData(context, params);
  } catch (error) {
    console.error("Dashboard certificates load failed", {
      organizationId: context.organization.id,
      userId: context.user.id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}

async function CertificatesContent({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const page = normalizeDashboardCertificatesPage(
    Number(firstQueryValue(resolvedSearchParams.page))
  );
  const search = normalizeDashboardCertificatesSearch(
    firstQueryValue(resolvedSearchParams.search)
  );
  const createdFrom = normalizeDashboardCertificateDate(
    firstQueryValue(resolvedSearchParams.createdFrom)
  );
  const createdTo = normalizeDashboardCertificateDate(
    firstQueryValue(resolvedSearchParams.createdTo)
  );
  const data = await loadCertificatesData({
    page,
    search,
    createdFrom,
    createdTo,
  });

  return (
    <>
      <LiveDataIndicator />

      <DashboardHeader
        title="Certificates"
        subtitle="Live certificate metadata for this organization."
      />

      {!data ? (
        <ErrorState />
      ) : (
        <>
          <FilterSummary data={data} />
          {data.rows.length > 0 ? (
            <>
              <DataTable
                columns={COLUMNS}
                rows={data.rows}
                footer="Showing safe tenant-scoped certificate metadata only. Full certificate JSON is not loaded on this page."
              />
              <PaginationControls data={data} />
            </>
          ) : (
            <EmptyState />
          )}
        </>
      )}
    </>
  );
}

export default function CertificatesPage({
  searchParams,
}: CertificatesPageProps) {
  return (
    <DashboardRoleGate section="certificates">
      <CertificatesContent searchParams={searchParams} />
    </DashboardRoleGate>
  );
}
