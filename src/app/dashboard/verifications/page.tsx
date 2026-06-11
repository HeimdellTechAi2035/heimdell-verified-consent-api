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
    header: "Session",
    cell: (r) => (
      <div>
        <p className="font-mono text-xs text-gray-500">{r.id}</p>
        <p className="font-mono text-xs text-gray-400 mt-0.5">
          Sale {r.saleId}
        </p>
      </div>
    ),
  },
  {
    header: "Reference",
    cell: (r) => (
      <span className="font-mono text-xs text-gray-600">
        {r.clientReference}
      </span>
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
    header: "Sale",
    cell: (r) => <StatusBadge status={r.saleStatus} />,
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
    header: "Expires",
    cell: (r) => (
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {formatDateTime(r.expiresAt)}
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
    header: "Certificate",
    cell: (r) =>
      r.certificateId ? (
        <span className="font-mono text-xs text-gray-500">
          {r.certificateId}
        </span>
      ) : (
        <span className="text-xs text-gray-400">None</span>
      ),
  },
  {
    header: "Action",
    cell: () => (
      <button
        disabled
        className="text-xs text-blue-400 cursor-not-allowed"
        title="Verification detail view is not available yet"
      >
        View details
      </button>
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
        <span className="font-semibold">Live tenant-scoped data.</span>{" "}
        Verification sessions are loaded server-side for your organization
        only. Raw tokens, verification URLs, hashes, contact details, and
        payment details are not shown.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
      <h3 className="text-sm font-semibold text-gray-700">
        No verification sessions found
      </h3>
      <p className="text-xs text-gray-400 mt-1">
        Sessions will appear after this organization creates sales and issues
        verification links. Filters may also be hiding existing rows.
      </p>
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
        Page {data.pagination.page} of {data.pagination.totalPages} ·{" "}
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
        subtitle="Live verification sessions for this organization."
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
                footer="Showing safe tenant-scoped verification fields only. Search is limited to sale ID and client reference."
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
