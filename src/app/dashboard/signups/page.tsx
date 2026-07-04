// Dashboard -- Signups page.
// Platform-admin review queue for public self-serve signup applications.

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { DataTable, type DataTableColumn } from "@/components/dashboard/DataTable";
import { SignupApprovalForm } from "@/components/dashboard/SignupApprovalForm";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import { getAllowedDashboardRoles } from "@/lib/dashboard-role-policy";
import {
  getPendingOrganizationSignups,
  type PendingOrganizationSignup,
} from "@/lib/dashboard-client-provisioning";
import { rejectSignupAction } from "./actions";

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function RejectForm({ organizationId }: { organizationId: string }) {
  return (
    <form action={rejectSignupAction} className="space-y-1.5">
      <input type="hidden" name="organizationId" value={organizationId} />
      <label className="block text-[11px] font-medium text-red-700">
        Reject with reason
      </label>
      <div className="flex items-center gap-2">
        <input
          name="reason"
          placeholder="e.g. Could not verify company details"
          className="w-48 rounded border border-red-200 px-2 py-1 text-xs text-gray-900"
        />
        <button
          type="submit"
          className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
        >
          Reject
        </button>
      </div>
    </form>
  );
}

const COLUMNS: DataTableColumn<PendingOrganizationSignup>[] = [
  {
    header: "Company",
    cell: (row) => (
      <div>
        <p className="text-sm font-medium text-gray-900">{row.name}</p>
        <p className="mt-0.5 font-mono text-xs text-gray-400">{row.slug}</p>
      </div>
    ),
  },
  {
    header: "Companies House",
    cell: (row) => (
      <span className="text-xs text-gray-700">{row.companiesHouseNumber ?? "—"}</span>
    ),
  },
  {
    header: "ICO registration",
    cell: (row) => (
      <span className="text-xs text-gray-700">{row.icoRegistrationNumber ?? "—"}</span>
    ),
  },
  {
    header: "Business address",
    cell: (row) => (
      <span className="max-w-[220px] text-xs text-gray-700">{row.businessAddress ?? "—"}</span>
    ),
  },
  {
    header: "Contact",
    cell: (row) => (
      <div className="text-xs text-gray-700">
        <p>{row.primaryContactName ?? "—"}</p>
        <p className="mt-0.5 text-gray-500">{row.primaryContactEmail ?? "—"}</p>
        {row.primaryContactPhone && <p className="mt-0.5 text-gray-500">{row.primaryContactPhone}</p>}
      </div>
    ),
  },
  {
    header: "Submitted",
    cell: (row) => (
      <span className="whitespace-nowrap text-xs text-gray-500">{formatDate(row.createdAt)}</span>
    ),
  },
  {
    header: "Action",
    cell: (row) => (
      <div className="flex min-w-52 flex-col gap-3">
        <SignupApprovalForm organizationId={row.organizationId} organizationName={row.name} />
        <RejectForm organizationId={row.organizationId} />
      </div>
    ),
  },
];

function EmptyState() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700">No pending signups</h3>
      <p className="mt-1 text-xs text-gray-400">
        New applications submitted at /signup will appear here for review.
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="rounded-2xl border border-red-100 bg-white p-6 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-red-700">Signups list unavailable</h3>
      <p className="text-xs text-gray-500">
        Heimdell could not load pending signup applications right now.
      </p>
    </div>
  );
}

async function SignupsContent({ rejected }: { rejected: boolean }) {
  await requireDashboardRole(getAllowedDashboardRoles("signups"));

  let rows: PendingOrganizationSignup[] | null = null;
  try {
    rows = await getPendingOrganizationSignups();
  } catch (error) {
    console.error("Dashboard signups load failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }

  return (
    <>
      <DashboardHeader
        title="Signups"
        subtitle="Applications submitted via the public signup form. Companies House and ICO numbers are self-reported — check they look legitimate before approving."
      />

      {rejected && (
        <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs font-medium text-gray-700">
          Application rejected.
        </div>
      )}

      {!rows ? (
        <ErrorState />
      ) : rows.length > 0 ? (
        <DataTable
          columns={COLUMNS}
          rows={rows}
          footer="Approving creates the Supabase login, Client record, and CLIENT_OWNER membership, and emails the applicant their temporary password."
        />
      ) : (
        <EmptyState />
      )}
    </>
  );
}

export default async function SignupsPage({
  searchParams,
}: {
  searchParams: Promise<{ rejected?: string }>;
}) {
  const params = await searchParams;

  return (
    <DashboardRoleGate section="signups">
      <SignupsContent rejected={params.rejected === "1"} />
    </DashboardRoleGate>
  );
}
