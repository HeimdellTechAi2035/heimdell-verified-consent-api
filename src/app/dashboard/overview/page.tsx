// Dashboard -- Overview page.
// Live tenant-scoped metrics for the authenticated organization.

import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { DataTable, type DataTableColumn } from "@/components/dashboard/DataTable";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { requireOrganizationMembership } from "@/lib/dashboard-auth";
import {
  getDashboardOverviewData,
  type DashboardOverviewActivity,
  type DashboardOverviewData,
} from "@/lib/dashboard-overview";

function EndpointRow({
  method,
  path,
  desc,
}: {
  method: string;
  path: string;
  desc: string;
}) {
  const isPost = method === "POST";
  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
      <span
        className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded font-mono ${
          isPost ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
        }`}
      >
        {method}
      </span>
      <code className="text-xs text-gray-700 font-mono shrink-0">{path}</code>
      <span className="text-xs text-gray-400">{desc}</span>
    </div>
  );
}

const ACTIVITY_COLS: DataTableColumn<DashboardOverviewActivity>[] = [
  {
    header: "Timestamp",
    cell: (r) => (
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {new Date(r.activityAt).toLocaleString("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </span>
    ),
  },
  {
    header: "Status",
    cell: (r) => <StatusBadge status={r.verificationStatus} />,
  },
  {
    header: "Client Ref",
    cell: (r) => (
      <span className="font-mono text-xs text-gray-600">
        {r.clientReference}
      </span>
    ),
  },
  {
    header: "Product",
    cell: (r) => (
      <span className="text-sm font-medium text-gray-800">
        {r.productName ?? "Product not named"}
      </span>
    ),
  },
];

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
        Overview metrics are loaded server-side for your organization only.
        Other sections remain visible only where the signed-in role is allowed.
      </p>
    </div>
  );
}

function OverviewErrorState() {
  return (
    <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-red-700 mb-2">
        Overview data unavailable
      </h3>
      <p className="text-xs text-gray-500">
        Heimdell could not load live overview metrics right now. No sensitive
        details were exposed; try again after checking the server logs and
        database connection.
      </p>
    </div>
  );
}

function EmptyActivityState() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
      <h3 className="text-sm font-semibold text-gray-700">
        No verification activity yet
      </h3>
      <p className="text-xs text-gray-400 mt-1">
        Tenant-scoped activity will appear here after this organization submits
        sales and customers open or complete verification sessions.
      </p>
    </div>
  );
}

async function loadOverviewData(): Promise<DashboardOverviewData | null> {
  const context = await requireOrganizationMembership();

  try {
    return await getDashboardOverviewData(context);
  } catch (error) {
    console.error("Dashboard overview load failed", {
      organizationId: context.organization.id,
      userId: context.user.id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}

async function OverviewContent() {
  const overview = await loadOverviewData();

  if (!overview) {
    return (
      <>
        <LiveDataIndicator />

        <DashboardHeader
          title="Overview"
          subtitle="Live organization metrics loaded server-side."
        />

        <OverviewErrorState />
      </>
    );
  }

  const { metrics, recentActivity } = overview;

  return (
    <>
      <LiveDataIndicator />

      <DashboardHeader
        title="Overview"
        subtitle="Live organization metrics loaded server-side."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <DashboardCard
          title="Total Sales"
          value={metrics.totalSales}
          tone="blue"
          description="All submitted sales for this organization"
        />
        <DashboardCard
          title="Pending Verifications"
          value={metrics.pendingVerifications}
          tone="amber"
          description="Sent but not completed, declined, or expired"
        />
        <DashboardCard
          title="Completed Verifications"
          value={metrics.completedVerifications}
          tone="green"
          description="Customer confirmed and signed"
        />
        <DashboardCard
          title="Declined Verifications"
          value={metrics.declinedVerifications}
          tone="red"
          description="Customer declined or details incorrect"
        />
        <DashboardCard
          title="Expired Verifications"
          value={metrics.expiredVerifications}
          tone="gray"
          description="Verification links that expired"
        />
        <DashboardCard
          title="Certificates Issued"
          value={metrics.certificatesIssued}
          tone="violet"
          description="Immutable compliance proofs generated"
        />
        <DashboardCard
          title="Recent Activity"
          value={metrics.recentVerificationActivity}
          tone="blue"
          description="Verification sessions visible to this organization"
        />
        <DashboardCard
          title="Completion Rate"
          value={`${metrics.completionRate}%`}
          tone="green"
          description="Completed share of current verification sessions"
        />
      </div>

      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Recent Activity
        </h3>
        {recentActivity.length > 0 ? (
          <DataTable
            columns={ACTIVITY_COLS}
            rows={recentActivity}
            footer="Showing safe tenant-scoped verification activity only."
          />
        ) : (
          <EmptyActivityState />
        )}
      </div>

      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <svg
            className="w-4 h-4 text-blue-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
          <h3 className="text-sm font-semibold text-blue-800">
            Demo-ready security posture
          </h3>
        </div>
        <ol className="space-y-1.5 text-xs text-blue-700 list-decimal list-inside">
          <li>
            Live dashboard sections load tenant-scoped records server-side.
          </li>
          <li>
            Seller users see only their own submitted sales in My Sales.
          </li>
          <li>
            Continue hiding raw tokens, hashes, API keys, and full bank/payment
            details.
          </li>
        </ol>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          API Endpoints
        </h3>
        <div className="space-y-0">
          <EndpointRow
            method="POST"
            path="/api/v1/sales/intake"
            desc="Create a sale and issue a verification link"
          />
          <EndpointRow
            method="GET"
            path="/api/v1/verification-sessions/[token]"
            desc="Look up session data for the customer consent page"
          />
          <EndpointRow
            method="POST"
            path="/api/v1/verification-sessions/[token]/complete"
            desc="Submit the customer's full consent confirmation"
          />
          <EndpointRow
            method="POST"
            path="/api/v1/verification-sessions/[token]/decline"
            desc="Record a customer decline"
          />
          <EndpointRow
            method="GET"
            path="/api/v1/certificates/[id]"
            desc="Retrieve a compliance certificate (x-api-key required)"
          />
          <EndpointRow
            method="POST"
            path="/api/v1/webhooks/test"
            desc="Preview a signed webhook payload (x-api-key required)"
          />
          <EndpointRow
            method="GET"
            path="/api/health"
            desc="Service health check (no auth, no database)"
          />
        </div>
      </div>
    </>
  );
}

export default function OverviewPage() {
  return (
    <DashboardRoleGate section="overview">
      <OverviewContent />
    </DashboardRoleGate>
  );
}
