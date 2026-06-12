import type { Metadata } from "next";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { DataTable, type DataTableColumn } from "@/components/dashboard/DataTable";
import { StaffPasswordResetForm } from "@/components/dashboard/StaffPasswordResetForm";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import { STAFF_MANAGER_ROLES } from "@/lib/dashboard-role-policy";
import {
  canResetStaffPassword,
  getDashboardStaffRows,
  type DashboardStaffRow,
} from "@/lib/dashboard-staff";

export const metadata: Metadata = {
  title: "Staff - Heimdell",
};

type Props = {
  searchParams: Promise<{
    created?: string;
  }>;
};

function buildColumns(params: {
  actorRole: DashboardStaffRow["role"];
  actorUserId: string;
}): DataTableColumn<DashboardStaffRow>[] {
  return [
  {
    header: "Staff member",
    cell: (row) => (
      <div>
        <p className="text-sm font-medium text-gray-900">
          {row.name ?? "Unnamed user"}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">{row.email}</p>
      </div>
    ),
  },
  {
    header: "Role",
    cell: (row) => <StatusBadge status={row.role} />,
  },
  {
    header: "Organization",
    cell: (row) => (
      <span className="text-xs text-gray-500">{row.organizationName}</span>
    ),
  },
  {
    header: "Password",
    cell: (row) => (
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
          row.mustChangePassword
            ? "bg-amber-50 text-amber-700"
            : "bg-green-50 text-green-700"
        }`}
      >
        {row.mustChangePassword ? "Change required" : "Changed"}
      </span>
    ),
  },
  {
    header: "Created",
    cell: (row) => (
      <span className="text-xs text-gray-500">
        {row.createdAt.toLocaleDateString("en-GB")}
      </span>
    ),
  },
  {
    header: "Action",
    cell: (row) => (
      <StaffPasswordResetForm
        targetUserId={row.userId}
        targetName={row.name}
        targetEmail={row.email}
        targetRole={row.role}
        canReset={canResetStaffPassword({
          actorRole: params.actorRole,
          targetRole: row.role,
          actorUserId: params.actorUserId,
          targetUserId: row.userId,
        })}
      />
    ),
  },
  ];
}

export default async function StaffPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <DashboardRoleGate section="staff">
      <StaffPageContent created={params.created === "1"} />
    </DashboardRoleGate>
  );
}

async function StaffPageContent({ created }: { created: boolean }) {
  const context = await requireDashboardRole(STAFF_MANAGER_ROLES);
  const rows = await getDashboardStaffRows();
  const columns = buildColumns({
    actorRole: context.membership.role,
    actorUserId: context.user.id,
  });

  return (
    <>
      <DashboardHeader
        title="Staff"
        subtitle="Manage dashboard users for the current organization."
        action={
          <Link
            href="/dashboard/staff/new"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Staff
          </Link>
        }
      />

      {created && (
        <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Staff user created. Share the temporary password through an approved secure channel.
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">No staff yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create a manager, seller, or compliance viewer for this organization.
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          footer={`Showing ${rows.length} staff member${rows.length === 1 ? "" : "s"} for this organization.`}
        />
      )}
    </>
  );
}
