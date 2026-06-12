// Dashboard -- Overview page.
// Live organization metrics for the authenticated organization.

import Link from "next/link";
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
        <span className="font-semibold">Secure company view.</span>{" "}
        Overview metrics are loaded for your organization only. Each dashboard
        section is shown only where the signed-in role is allowed.
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
        Activity will appear here after your team sends verifications and
        customers open or complete their secure links.
      </p>
    </div>
  );
}

function ChecklistStatus({
  status,
}: {
  status: "completed" | "needs action" | "optional";
}) {
  const styles = {
    completed: "bg-green-100 text-green-700",
    "needs action": "bg-amber-100 text-amber-700",
    optional: "bg-gray-100 text-gray-600",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles[status]}`}>
      {status}
    </span>
  );
}

function PilotOnboardingChecklist({ data }: { data: DashboardOverviewData }) {
  const items = [
    {
      title: "Review company details",
      description: "Confirm the company name and contact details shown to customers.",
      href: "/dashboard/settings",
      action: "Open settings",
      status: data.onboarding.hasCompanyDetails ? "completed" : "needs action",
    },
    {
      title: "Add or review policy wording",
      description: "Check terms, cooling-off, cancellation, privacy, and Direct Debit wording.",
      href: "/dashboard/settings",
      action: "Review policies",
      status: data.onboarding.hasPolicy ? "completed" : "needs action",
    },
    {
      title: "Add sellers",
      description: "Create seller logins for the people who will send verifications.",
      href: "/dashboard/staff",
      action: "Manage sellers",
      status: data.onboarding.sellerCount > 0 ? "completed" : "needs action",
    },
    {
      title: "Send first test verification",
      description: "Create a test sale and send the secure customer link.",
      href: "/dashboard/sales/new",
      action: "New Verification",
      status: data.metrics.totalSales > 0 ? "completed" : "needs action",
    },
    {
      title: "Complete customer test link",
      description: "Open the customer link, review the evidence, and confirm or decline.",
      href: "/dashboard/verifications",
      action: "View verifications",
      status:
        data.metrics.completedVerifications + data.metrics.declinedVerifications > 0
          ? "completed"
          : "needs action",
    },
    {
      title: "View certificate/PDF",
      description: "Confirm the certificate contains the human-readable proof.",
      href: "/dashboard/certificates",
      action: "View certificates",
      status: data.metrics.certificatesIssued > 0 ? "completed" : "needs action",
    },
    {
      title: "Check notification status",
      description: "Review customer notification records and delivery outcomes.",
      href: "/dashboard/notifications",
      action: "Open notifications",
      status: data.onboarding.notificationCount > 0 ? "completed" : "optional",
    },
    {
      title: "Go live",
      description: "Use the pilot test checklist before sending real customer links.",
      href: "/dashboard/sales/new",
      action: "Start live flow",
      status:
        data.metrics.certificatesIssued > 0 && data.onboarding.notificationCount > 0
          ? "completed"
          : "needs action",
    },
  ] as const;

  return (
    <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">
            Pilot onboarding checklist
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Work through these steps before sending customer verifications in
            the pilot.
          </p>
        </div>
        <Link
          href="/dashboard/sales/new"
          className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
        >
          New Verification
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item, index) => (
          <div
            key={item.title}
            className="rounded-xl border border-gray-100 bg-gray-50 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-gray-400">
                  Step {index + 1}
                </p>
                <h4 className="mt-1 text-sm font-semibold text-gray-900">
                  {item.title}
                </h4>
              </div>
              <ChecklistStatus status={item.status} />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-gray-500">
              {item.description}
            </p>
            <Link
              href={item.href}
              className="mt-3 inline-flex text-xs font-semibold text-blue-600"
            >
              {item.action}
            </Link>
          </div>
        ))}
      </div>
    </section>
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
        subtitle="Company verification activity and pilot setup progress."
      />

      <PilotOnboardingChecklist data={overview} />

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
            footer="Showing safe verification activity for your organization only."
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
            Security check
          </h3>
        </div>
        <ol className="space-y-1.5 text-xs text-blue-700 list-decimal list-inside">
          <li>
            Dashboard sections load company records server-side.
          </li>
          <li>
            Seller users see only their own submitted sales in My Sales.
          </li>
          <li>
            Full bank account numbers and sensitive access credentials are not
            shown in the dashboard.
          </li>
        </ol>
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
