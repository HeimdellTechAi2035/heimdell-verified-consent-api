// Dashboard -- Clients page.
// Platform-admin list of client organizations with setup checklist links.

import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/dashboard/DataTable";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import { getAllowedDashboardRoles } from "@/lib/dashboard-role-policy";
import {
  getPlatformClientSetupList,
  type PlatformClientListRow,
} from "@/lib/dashboard-client-setup";
import {
  archiveClientOrganizationAction,
  hardDeleteTestClientOrganizationAction,
  restoreClientOrganizationAction,
} from "./actions";

const NewClientButton = (
  <Link
    href="/dashboard/clients/new"
    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
  >
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4v16m8-8H4"
      />
    </svg>
    New Client
  </Link>
);

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    dateStyle: "medium",
  });
}

type CleanupStatus =
  | "archived"
  | "archive-blocked"
  | "restored"
  | "restore-blocked"
  | "deleted"
  | "delete-blocked";

type ProvisioningStatus = "1" | "reused-user";

function DeleteTestClientForm({
  row,
  showArchived,
}: {
  row: PlatformClientListRow;
  showArchived: boolean;
}) {
  if (!row.canHardDelete) {
    return (
      <p className="max-w-xs text-[11px] leading-relaxed text-gray-400">
        Hard delete blocked: {row.hardDeleteBlockers.join(", ")}. Archive this
        client instead.
      </p>
    );
  }

  return (
    <form action={hardDeleteTestClientOrganizationAction} className="space-y-1.5">
      <input type="hidden" name="organizationId" value={row.organizationId} />
      <input
        type="hidden"
        name="returnToArchived"
        value={showArchived ? "1" : "0"}
      />
      <label
        htmlFor={`delete-${row.organizationId}`}
        className="block text-[11px] font-medium text-red-700"
      >
        Type DELETE to hard delete empty test client
      </label>
      <div className="flex items-center gap-2">
        <input
          id={`delete-${row.organizationId}`}
          name="confirmation"
          className="w-24 rounded border border-red-200 px-2 py-1 text-xs text-gray-900"
          autoComplete="off"
        />
        <button
          type="submit"
          className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
        >
          Hard delete
        </button>
      </div>
    </form>
  );
}

function getColumns(
  showArchived: boolean
): DataTableColumn<PlatformClientListRow>[] {
  return [
    {
      header: "Organisation",
      cell: (row) => (
        <div>
          <p className="font-medium text-gray-900 text-sm">
            {row.organizationName}
          </p>
          <p className="font-mono text-xs text-gray-400 mt-0.5">
            {row.organizationId}
          </p>
        </div>
      ),
    },
    {
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: "Client Rows",
      cell: (row) => (
        <span className="text-xs text-gray-600">{row.clientCount}</span>
      ),
    },
    {
      header: "Members",
      cell: (row) => (
        <span className="text-xs text-gray-600">{row.membershipCount}</span>
      ),
    },
    {
      header: "API Keys",
      cell: (row) => (
        <span className="text-xs text-gray-600">
          {row.activeApiKeyCount} active
        </span>
      ),
    },
    {
      header: "Webhook",
      cell: (row) => (
        <StatusBadge status={row.webhookConfigured ? "ACTIVE" : "INACTIVE"} />
      ),
    },
    {
      header: "Sales",
      cell: (row) => (
        <span className="text-xs text-gray-600">{row.totalSales}</span>
      ),
    },
    {
      header: "Created",
      cell: (row) => (
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {formatDate(row.createdAt)}
        </span>
      ),
    },
    {
      header: "Action",
      cell: (row) => (
        <div className="flex min-w-56 flex-col gap-2">
          <Link
            href={`/dashboard/clients/${row.organizationId}`}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800"
          >
            View setup
          </Link>

          {showArchived ? (
            <form action={restoreClientOrganizationAction}>
              <input
                type="hidden"
                name="organizationId"
                value={row.organizationId}
              />
              <input type="hidden" name="returnToArchived" value="1" />
              <button
                type="submit"
                className="text-xs font-semibold text-green-700 hover:text-green-800"
              >
                Restore
              </button>
            </form>
          ) : (
            <form action={archiveClientOrganizationAction}>
              <input
                type="hidden"
                name="organizationId"
                value={row.organizationId}
              />
              <input type="hidden" name="returnToArchived" value="0" />
              <button
                type="submit"
                className="text-xs font-semibold text-amber-700 hover:text-amber-800"
              >
                Archive
              </button>
            </form>
          )}

          <DeleteTestClientForm row={row} showArchived={showArchived} />
        </div>
      ),
    },
  ];
}

function CleanupStatusBanner({ status }: { status: CleanupStatus | null }) {
  if (!status) {
    return null;
  }

  const isSuccess = ["archived", "restored", "deleted"].includes(status);
  const message: Record<CleanupStatus, string> = {
    archived:
      "Client organization archived. Existing evidence and delivery history were preserved.",
    "archive-blocked":
      "Archive was blocked. You cannot archive the active platform organization for this session.",
    restored: "Client organization restored.",
    "restore-blocked": "Restore was blocked. The client organization could not be updated.",
    deleted: "Empty test client organization hard deleted.",
    "delete-blocked":
      "Hard delete was blocked. Archive this client instead unless it has no sales, verification sessions, certificates, webhook deliveries, or active API keys.",
  };

  return (
    <div
      className={`mb-5 rounded-xl border px-4 py-3 text-xs font-medium ${
        isSuccess
          ? "border-green-200 bg-green-50 text-green-800"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      {message[status]}
    </div>
  );
}

function ProvisioningStatusBanner({
  status,
}: {
  status: ProvisioningStatus | null;
}) {
  if (!status) {
    return null;
  }

  const message =
    status === "reused-user"
      ? "Existing dashboard user reused and attached to the new client company."
      : "Client company provisioned successfully.";

  return (
    <div className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-xs font-medium text-green-800">
      {message}
    </div>
  );
}

function EmptyState({ showArchived }: { showArchived: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
      <h3 className="text-sm font-semibold text-gray-700">
        {showArchived
          ? "No archived client organizations"
          : "No active client organizations yet"}
      </h3>
      <p className="text-xs text-gray-400 mt-1">
        {showArchived
          ? "Archived client organizations will appear here for review or restore."
          : "Platform admins can create the first client organization from New Client."}
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-red-700 mb-2">
        Client list unavailable
      </h3>
      <p className="text-xs text-gray-500">
        Heimdell could not load client setup metadata right now. No secrets or
        customer data were exposed.
      </p>
    </div>
  );
}

async function ClientsContent({
  showArchived,
  cleanupStatus,
  provisioningStatus,
}: {
  showArchived: boolean;
  cleanupStatus: CleanupStatus | null;
  provisioningStatus: ProvisioningStatus | null;
}) {
  const context = await requireDashboardRole(getAllowedDashboardRoles("clients"));
  let rows: PlatformClientListRow[] | null = null;

  try {
    rows = await getPlatformClientSetupList(context, {
      archived: showArchived,
    });
  } catch (error) {
    console.error("Dashboard clients load failed", {
      organizationId: context.organization.id,
      userId: context.user.id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }

  return (
    <>
      <DashboardHeader
        title="Clients"
        subtitle="Platform-admin view of client organizations and setup status. Archived clients are hidden from the default list and cannot create new sales, API keys, webhooks, or staff."
        action={NewClientButton}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link
          href="/dashboard/clients"
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
            showArchived
              ? "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              : "border-blue-200 bg-blue-50 text-blue-700"
          }`}
        >
          Active clients
        </Link>
        <Link
          href="/dashboard/clients?archived=1"
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
            showArchived
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          Archived clients
        </Link>
      </div>

      <ProvisioningStatusBanner status={provisioningStatus} />
      <CleanupStatusBanner status={cleanupStatus} />

      {!rows ? (
        <ErrorState />
      ) : rows.length > 0 ? (
        <DataTable
          columns={getColumns(showArchived)}
          rows={rows}
          footer={
            showArchived
              ? "Showing archived client organizations. Evidence remains preserved; restore before allowing new operational setup."
              : "Showing active client organizations only. Archive test clients instead of deleting evidence-bearing records."
          }
        />
      ) : (
        <EmptyState showArchived={showArchived} />
      )}

      <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          About client cleanup
        </h3>
        <ul className="space-y-1.5 text-xs text-gray-500">
          <li>
            Archive test clients to hide them from default operations while
            preserving evidence, audit, webhook, verification, and certificate
            records.
          </li>
          <li>
            Hard delete is only available for empty test clients with no sales,
            verification sessions, certificates, webhook deliveries, or active
            API keys.
          </li>
          <li>
            Archived clients cannot create new sales, API keys, webhook
            settings, or staff until restored.
          </li>
          <li>
            Raw API keys, API key hashes, webhook secrets, tokens, and customer
            payment data are not shown on this page.
          </li>
        </ul>
      </div>
    </>
  );
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    archived?: string;
    cleanup?: string;
    provisioned?: string;
  }>;
}) {
  const params = await searchParams;
  const showArchived = params.archived === "1";
  const cleanupStatus = isCleanupStatus(params.cleanup)
    ? params.cleanup
    : null;
  const provisioningStatus = isProvisioningStatus(params.provisioned)
    ? params.provisioned
    : null;

  return (
    <DashboardRoleGate section="clients">
      <ClientsContent
        showArchived={showArchived}
        cleanupStatus={cleanupStatus}
        provisioningStatus={provisioningStatus}
      />
    </DashboardRoleGate>
  );
}

function isCleanupStatus(value: string | undefined): value is CleanupStatus {
  return [
    "archived",
    "archive-blocked",
    "restored",
    "restore-blocked",
    "deleted",
    "delete-blocked",
  ].includes(value ?? "");
}

function isProvisioningStatus(
  value: string | undefined
): value is ProvisioningStatus {
  return ["1", "reused-user"].includes(value ?? "");
}
