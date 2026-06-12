// Dashboard -- Webhooks page.
// Live tenant-scoped outbound webhook delivery metadata.

import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { DataTable, type DataTableColumn } from "@/components/dashboard/DataTable";
import { requireOrganizationMembership } from "@/lib/dashboard-auth";
import {
  getDashboardWebhooksData,
  normalizeDashboardWebhooksEventType,
  normalizeDashboardWebhooksPage,
  normalizeDashboardWebhooksSearch,
  normalizeDashboardWebhooksStatus,
  type DashboardWebhookRow,
  type DashboardWebhooksData,
} from "@/lib/dashboard-webhooks";

type WebhooksPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not scheduled";
  }

  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function buildWebhooksHref(params: {
  page: number;
  status: string | null;
  eventType: string | null;
  search: string | null;
}) {
  const query = new URLSearchParams();

  if (params.page > 1) query.set("page", String(params.page));
  if (params.status) query.set("status", params.status);
  if (params.eventType) query.set("eventType", params.eventType);
  if (params.search) query.set("search", params.search);

  const queryString = query.toString();
  return queryString ? `/dashboard/webhooks?${queryString}` : "/dashboard/webhooks";
}

const COLUMNS: DataTableColumn<DashboardWebhookRow>[] = [
  {
    header: "Delivery",
    cell: (r) => (
      <div>
        <p className="font-mono text-xs text-gray-500">{r.deliveryId}</p>
        <p className="font-mono text-xs text-gray-400 mt-0.5">
          Notification {r.id}
        </p>
      </div>
    ),
  },
  {
    header: "Event",
    cell: (r) => (
      <span className="font-mono text-xs text-gray-700">{r.eventType}</span>
    ),
  },
  {
    header: "Status",
    cell: (r) => <StatusBadge status={r.status} />,
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
    header: "Evidence",
    cell: (r) => (
      <div>
        <p className="font-mono text-xs text-gray-500">
          Session {r.verificationSessionId ?? "Not recorded"}
        </p>
        <p className="font-mono text-xs text-gray-400 mt-0.5">
          Certificate {r.certificateId ?? "Not issued"}
        </p>
      </div>
    ),
  },
  {
    header: "Attempts",
    cell: (r) => (
      <span className="text-xs text-gray-600">
        {r.attempts} / {r.maxAttempts}
      </span>
    ),
  },
  {
    header: "Next",
    cell: (r) => (
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {formatDateTime(r.nextAttemptAt)}
      </span>
    ),
  },
  {
    header: "Last",
    cell: (r) => (
      <div className="text-xs text-gray-500">
        <p className="whitespace-nowrap">{formatDateTime(r.lastAttemptAt)}</p>
        <p className="mt-0.5">
          HTTP {r.lastResponseStatus ?? "not recorded"}
        </p>
      </div>
    ),
  },
  {
    header: "Outcome",
    cell: (r) => (
      <div className="text-xs text-gray-500">
        <p className="whitespace-nowrap">
          Delivered {formatDateTime(r.deliveredAt)}
        </p>
        <p className="whitespace-nowrap mt-0.5">
          Terminal {formatDateTime(r.terminalFailureAt)}
        </p>
        {r.lastSafeError && (
          <p className="mt-1 max-w-[220px] truncate text-red-600">
            {r.lastSafeError}
          </p>
        )}
      </div>
    ),
  },
  {
    header: "Destination",
    cell: (r) => (
      <span className="text-xs text-gray-500">
        {r.destinationHost ?? "Not configured"}
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
    header: "Actions",
    cell: () => (
      <div className="flex flex-col gap-1">
        <button
          disabled
          className="text-left text-xs text-blue-400 cursor-not-allowed"
          title="Retry actions are not active in this phase"
        >
          Retry now
        </button>
        <button
          disabled
          className="text-left text-xs text-blue-400 cursor-not-allowed"
          title="Delivery detail view is not active in this phase"
        >
          View delivery
        </button>
        <button
          disabled
          className="text-left text-xs text-blue-400 cursor-not-allowed"
          title="Webhook endpoint editing is not active in this phase"
        >
          Edit endpoint
        </button>
      </div>
    ),
  },
];

function LiveDataIndicator() {
  return (
    <div className="mb-6 flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-5 py-4">
      <svg className="w-5 h-5 text-green-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
      <p className="text-sm text-green-800">
        <span className="font-semibold">Secure company data.</span>{" "}
        Webhook delivery metadata is loaded server-side for your organization only.
        Secrets, payloads, raw headers, customer data, and payment details are not shown.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
      <h3 className="text-sm font-semibold text-gray-700">
        No webhook deliveries found
      </h3>
      <p className="text-xs text-gray-400 mt-1">
        Delivery records will appear after webhook-capable client events are queued.
        Filters may also be hiding existing rows.
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-red-700 mb-2">
        Webhook data unavailable
      </h3>
      <p className="text-xs text-gray-500">
        Heimdell could not load live webhook delivery metadata right now. No
        sensitive details were exposed; check the server logs and database
        connection.
      </p>
    </div>
  );
}

function FilterSummary({ data }: { data: DashboardWebhooksData }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
      <span className="font-semibold text-gray-700">Filters:</span>
      <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1">
        Status: {data.filters.status ?? "Any"}
      </span>
      <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1">
        Event: {data.filters.eventType ?? "Any"}
      </span>
      <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1">
        Reference search: {data.filters.search ?? "None"}
      </span>
      {(data.filters.status || data.filters.eventType || data.filters.search) && (
        <Link className="text-blue-600 font-semibold" href="/dashboard/webhooks">
          Clear
        </Link>
      )}
    </div>
  );
}

function PaginationControls({ data }: { data: DashboardWebhooksData }) {
  const previousHref = buildWebhooksHref({
    page: data.pagination.page - 1,
    status: data.filters.status,
    eventType: data.filters.eventType,
    search: data.filters.search,
  });
  const nextHref = buildWebhooksHref({
    page: data.pagination.page + 1,
    status: data.filters.status,
    eventType: data.filters.eventType,
    search: data.filters.search,
  });

  return (
    <div className="mt-4 flex items-center justify-between gap-4 text-xs text-gray-500">
      <span>
        Page {data.pagination.page} of {data.pagination.totalPages} Â·{" "}
        {data.pagination.totalRows} webhook deliveries
      </span>
      <div className="flex items-center gap-2">
        {data.pagination.hasPreviousPage ? (
          <Link className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700" href={previousHref}>
            Previous
          </Link>
        ) : (
          <span className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-gray-300">
            Previous
          </span>
        )}
        {data.pagination.hasNextPage ? (
          <Link className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700" href={nextHref}>
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

async function loadWebhooksData(params: {
  page: number;
  status: string | null;
  eventType: string | null;
  search: string | null;
}) {
  const context = await requireOrganizationMembership();

  try {
    return await getDashboardWebhooksData(context, params);
  } catch (error) {
    console.error("Dashboard webhooks load failed", {
      organizationId: context.organization.id,
      userId: context.user.id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}

async function WebhooksContent({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const page = normalizeDashboardWebhooksPage(
    Number(firstQueryValue(resolvedSearchParams.page))
  );
  const status = normalizeDashboardWebhooksStatus(
    firstQueryValue(resolvedSearchParams.status)
  );
  const eventType = normalizeDashboardWebhooksEventType(
    firstQueryValue(resolvedSearchParams.eventType)
  );
  const search = normalizeDashboardWebhooksSearch(
    firstQueryValue(resolvedSearchParams.search)
  );
  const data = await loadWebhooksData({ page, status, eventType, search });

  return (
    <>
      <LiveDataIndicator />

      <DashboardHeader
        title="Webhooks"
        subtitle="Live outbound webhook delivery metadata for this organization."
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
                footer="Showing safe webhook delivery status only. Setup and retry options appear when they are available."
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

export default function WebhooksPage({ searchParams }: WebhooksPageProps) {
  return (
    <DashboardRoleGate section="webhooks">
      <WebhooksContent searchParams={searchParams} />
    </DashboardRoleGate>
  );
}
