// Dashboard -- API Keys page.
// Live tenant-scoped ApiKey metadata while preserving Client.apiKeyHash compatibility.

import Link from "next/link";
import { ApiKeyCreateForm } from "@/components/dashboard/ApiKeyCreateForm";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { DataTable, type DataTableColumn } from "@/components/dashboard/DataTable";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import {
  API_KEY_MANAGER_ROLES,
  getDashboardApiKeysData,
  normalizeDashboardApiKeysPage,
  type DashboardApiKeyRow,
  type DashboardApiKeysData,
} from "@/lib/dashboard-api-keys";
import { revokeApiKeyAction } from "./actions";

type ApiKeysPageProps = {
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

const COLUMNS: DataTableColumn<DashboardApiKeyRow>[] = [
  {
    header: "Key",
    cell: (r) => (
      <div>
        <p className="font-medium text-gray-900 text-sm">{r.name}</p>
        <p className="font-mono text-xs text-gray-400 mt-0.5">{r.id}</p>
      </div>
    ),
  },
  {
    header: "Prefix",
    cell: (r) => (
      <span className="font-mono text-xs text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded">
        {r.keyPrefix}...
      </span>
    ),
  },
  {
    header: "Status",
    cell: (r) => <StatusBadge status={r.status} />,
  },
  {
    header: "Association",
    cell: (r) => (
      <div>
        <p className="text-xs text-gray-600">
          {r.clientName ?? "Organization-level"}
        </p>
        {r.clientId && (
          <p className="font-mono text-xs text-gray-400 mt-0.5">
            {r.clientId}
          </p>
        )}
      </div>
    ),
  },
  {
    header: "Created By",
    cell: (r) => (
      <span className="text-xs text-gray-500">
        {r.createdBy ?? "Not recorded"}
      </span>
    ),
  },
  {
    header: "Last Used",
    cell: (r) => (
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {formatDateTime(r.lastUsedAt)}
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
    header: "Created",
    cell: (r) => (
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {formatDateTime(r.createdAt)}
      </span>
    ),
  },
  {
    header: "Action",
    cell: (r) =>
      r.status === "ACTIVE" ? (
        <form action={revokeApiKeyAction}>
          <input name="apiKeyId" type="hidden" value={r.id} />
          <button
            className="text-xs text-red-500"
            title="Revokes this dashboard-managed ApiKey metadata record"
            type="submit"
          >
            Revoke
          </button>
        </form>
      ) : (
        <span className="text-xs text-gray-400">No action</span>
      ),
  },
];

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildApiKeysHref(page: number) {
  return page > 1 ? `/dashboard/api-keys?page=${page}` : "/dashboard/api-keys";
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
        This page lists dashboard-managed `ApiKey` metadata for your
        organization only. Raw keys and hashes are never listed.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
      <h3 className="text-sm font-semibold text-gray-700">
        No dashboard-managed API keys yet
      </h3>
      <p className="text-xs text-gray-400 mt-1">
        Existing `Client.apiKeyHash` credentials may still authenticate API
        routes. New dashboard-managed keys will appear here after creation.
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-red-700 mb-2">
        API key metadata unavailable
      </h3>
      <p className="text-xs text-gray-500">
        Heimdell could not load API key metadata right now. No raw keys or
        hashes were exposed; check the server logs and database connection.
      </p>
    </div>
  );
}

function PaginationControls({ data }: { data: DashboardApiKeysData }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-4 text-xs text-gray-500">
      <span>
        Page {data.pagination.page} of {data.pagination.totalPages} ·{" "}
        {data.pagination.totalRows} keys
      </span>
      <div className="flex items-center gap-2">
        {data.pagination.hasPreviousPage ? (
          <Link
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700"
            href={buildApiKeysHref(data.pagination.page - 1)}
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
            href={buildApiKeysHref(data.pagination.page + 1)}
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

async function loadApiKeysData(page: number) {
  const context = await requireDashboardRole(API_KEY_MANAGER_ROLES);

  try {
    return await getDashboardApiKeysData(context, { page });
  } catch (error) {
    console.error("Dashboard API key metadata load failed", {
      organizationId: context.organization.id,
      userId: context.user.id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}

async function ApiKeysContent({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const page = normalizeDashboardApiKeysPage(
    Number(firstQueryValue(resolvedSearchParams.page))
  );
  const data = await loadApiKeysData(page);

  return (
    <>
      <LiveDataIndicator />

      <DashboardHeader
        title="API Keys"
        subtitle="Dashboard-managed API key metadata. Existing Client.apiKeyHash authentication remains active for v1 API routes."
      />

      {!data ? (
        <ErrorState />
      ) : (
        <>
          <ApiKeyCreateForm
            clients={data.clients}
            organizations={data.organizations}
          />

          <div className="mb-5 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4">
            <svg
              className="w-5 h-5 text-red-500 shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z"
              />
            </svg>
            <div className="text-sm text-red-800">
              <p className="font-semibold">Never expose x-api-key in browser code</p>
              <p className="mt-0.5 text-xs">
                API keys must only be used from trusted server-side systems.
                Raw keys are shown once after creation and are never stored in
                plain text.
              </p>
            </div>
          </div>

          {data.rows.length > 0 ? (
            <>
              <DataTable
                columns={COLUMNS}
                rows={data.rows}
                footer="Showing tenant-scoped ApiKey metadata only. Raw keys and bcrypt hashes are never returned."
              />
              <PaginationControls data={data} />
            </>
          ) : (
            <EmptyState />
          )}

          <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Compatibility note
            </h3>
            <div className="space-y-2 text-xs text-gray-500">
              <p>
                Existing v1 endpoints still authenticate against{" "}
                <code className="font-mono bg-gray-100 px-1 rounded">
                  Client.apiKeyHash
                </code>
                . This page manages the newer{" "}
                <code className="font-mono bg-gray-100 px-1 rounded">
                  ApiKey
                </code>{" "}
                metadata model for future rotation and multi-key support.
              </p>
              <p>
                A later migration phase must update API authentication to
                support both models before legacy client keys are retired.
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default function ApiKeysPage({ searchParams }: ApiKeysPageProps) {
  return (
    <DashboardRoleGate section="api-keys">
      <ApiKeysContent searchParams={searchParams} />
    </DashboardRoleGate>
  );
}
