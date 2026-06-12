// Dashboard -- Verifications page.
// Live tenant-scoped verification sessions for the authenticated organization.

import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { DataTable, type DataTableColumn } from "@/components/dashboard/DataTable";
import { requireOrganizationMembership } from "@/lib/dashboard-auth";
import {
  getDashboardVerificationsData,
  normalizeDashboardVerificationsPage,
  normalizeDashboardVerificationsStatus,
  normalizeDashboardVerificationsSearch,
  type DashboardVerificationRow,
  type DashboardVerificationsData,
} from "@/lib/dashboard-verifications";

type VerificationsPageProps = {
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

const COLUMNS: DataTableColumn<DashboardVerificationRow>[] = [
  {
    header: "Customer",
    cell: (r) => (
      <div>
        <p className="text-sm font-medium text-gray-900">{r.customerName}</p>
        <p className="mt-0.5 text-xs text-gray-500">{r.customerPhone ?? "No phone"}</p>
        <p className="mt-0.5 text-xs text-gray-400">{r.customerEmail ?? "No email"}</p>
      </div>
    ),
  },
  {
    header: "Seller",
    cell: (r) => (
      <div>
        <p className="text-sm text-gray-700">{r.sellerName ?? "Unassigned"}</p>
        <p className="mt-0.5 text-xs text-gray-400">{r.sellerEmail ?? "No seller email"}</p>
      </div>
    ),
  },
  {
    header: "Product",
    cell: (r) => (
      <div>
        <p className="text-sm font-medium text-gray-900">{r.productName}</p>
        <p className="mt-0.5 text-xs text-gray-400">{r.priceSummary}</p>
      </div>
    ),
  },
  {
    header: "Verification",
    cell: (r) => <StatusBadge status={r.verificationStatus} />,
  },
  {
    header: "Sale",
    cell: (r) => <StatusBadge status={r.saleStatus} />,
  },
  {
    header: "Reference",
    cell: (r) => (
      <div>
        <p className="font-mono text-xs text-gray-500">{r.clientReference}</p>
        <p className="font-mono text-xs text-gray-400 mt-0.5">{r.id}</p>
      </div>
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
    header: "Resolved",
    cell: (r) => (
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {formatDateTime(r.completedAt ?? r.declinedAt)}
      </span>
    ),
  },
  {
    header: "Links",
    cell: (r) => (
      <div className="flex flex-col gap-1">
        <Link
          className="text-xs font-semibold text-blue-600"
          href={`/dashboard/verifications/${encodeURIComponent(r.id)}`}
        >
          View verification
        </Link>
        <Link
          className="text-xs font-semibold text-gray-600"
          href={`/dashboard/sales/${encodeURIComponent(r.saleId)}`}
        >
          View sale
        </Link>
        {r.certificateId && (
          <Link
            className="text-xs font-semibold text-green-700"
            href={`/dashboard/certificates/${encodeURIComponent(r.certificateId)}`}
          >
            View certificate
          </Link>
        )}
      </div>
    ),
  },
];

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildVerificationsHref(params: {
  page: number;
  status: string | null;
  search: string | null;
}) {
  const query = new URLSearchParams();

  if (params.page > 1) {
    query.set("page", String(params.page));
  }

  if (params.status) {
    query.set("status", params.status);
  }

  if (params.search) {
    query.set("search", params.search);
  }

  const queryString = query.toString();
  return queryString
    ? `/dashboard/verifications?${queryString}`
    : "/dashboard/verifications";
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
        <span className="font-semibold">Secure company data.</span>{" "}
        Verification sessions are loaded server-side for your organization
        only. Secure link internals, verification URLs, and payment details
        are not shown.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
      <h3 className="text-sm font-semibold text-gray-700">
        No verifications yet
      </h3>
      <p className="text-xs text-gray-400 mt-1">
        Create a new verification to send a secure customer confirmation link.
      </p>
      <Link
        href="/dashboard/sales/new"
        className="mt-4 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white"
      >
        Create a new verification
      </Link>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-red-700 mb-2">
        Verification data unavailable
      </h3>
      <p className="text-xs text-gray-500">
        Heimdell could not load live verification data right now. No sensitive
        details were exposed; check the server logs and database connection.
      </p>
    </div>
  );
}

function FilterSummary({ data }: { data: DashboardVerificationsData }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
      <span className="font-semibold text-gray-700">Filters:</span>
      <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1">
        Status: {data.filters.status ?? "All"}
      </span>
      <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1">
        Reference search: {data.filters.search ?? "None"}
      </span>
      {(data.filters.status || data.filters.search) && (
        <Link
          className="text-blue-600 font-semibold"
          href="/dashboard/verifications"
        >
          Clear
        </Link>
      )}
    </div>
  );
}

function PaginationControls({ data }: { data: DashboardVerificationsData }) {
  const previousHref = buildVerificationsHref({
    page: data.pagination.page - 1,
    status: data.filters.status,
    search: data.filters.search,
  });
  const nextHref = buildVerificationsHref({
    page: data.pagination.page + 1,
    status: data.filters.status,
    search: data.filters.search,
  });

  return (
    <div className="mt-4 flex items-center justify-between gap-4 text-xs text-gray-500">
      <span>
        Page {data.pagination.page} of {data.pagination.totalPages} Â·{" "}
        {data.pagination.totalRows} sessions
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

async function loadVerificationsData(params: {
  page: number;
  status: ReturnType<typeof normalizeDashboardVerificationsStatus>;
  search: string | null;
}) {
  const context = await requireOrganizationMembership();

  try {
    return await getDashboardVerificationsData(context, params);
  } catch (error) {
    console.error("Dashboard verifications load failed", {
      organizationId: context.organization.id,
      userId: context.user.id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}

async function VerificationsContent({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const page = normalizeDashboardVerificationsPage(
    Number(firstQueryValue(resolvedSearchParams.page))
  );
  const status = normalizeDashboardVerificationsStatus(
    firstQueryValue(resolvedSearchParams.status)
  );
  const search = normalizeDashboardVerificationsSearch(
    firstQueryValue(resolvedSearchParams.search)
  );
  const data = await loadVerificationsData({ page, status, search });

  return (
    <>
      <LiveDataIndicator />

      <DashboardHeader
        title="Verifications"
        subtitle="Customer verification status, outcomes, and certificate links."
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
                footer="Showing safe verification fields only. Search is limited to sale ID and client reference."
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

export default function VerificationsPage({
  searchParams,
}: VerificationsPageProps) {
  return (
    <DashboardRoleGate section="verifications">
      <VerificationsContent searchParams={searchParams} />
    </DashboardRoleGate>
  );
}
