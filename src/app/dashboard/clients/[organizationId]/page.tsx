import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { DataTable, type DataTableColumn } from "@/components/dashboard/DataTable";
import { StaffPasswordResetForm } from "@/components/dashboard/StaffPasswordResetForm";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import { getAllowedDashboardRoles } from "@/lib/dashboard-role-policy";
import { canResetStaffPassword } from "@/lib/dashboard-staff";
import {
  getPlatformClientSetupDetail,
  type ClientSetupApiKeyRow,
  type ClientSetupDetail,
  type ClientSetupUserRow,
  type SetupChecklistItem,
} from "@/lib/dashboard-client-setup";

export const metadata: Metadata = {
  title: "Client Setup - Heimdell",
};

type ClientDetailPageProps = {
  params: Promise<{ organizationId: string }>;
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

function SetupStatusPill({ status }: { status: ClientSetupDetail["overallStatus"] }) {
  const classes =
    status === "Complete"
      ? "bg-green-50 text-green-700 border-green-200"
      : status === "Needs attention"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-gray-50 text-gray-600 border-gray-200";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${classes}`}>
      {status}
    </span>
  );
}

function ChecklistPill({ status }: { status: SetupChecklistItem["status"] }) {
  const label =
    status === "DONE"
      ? "Done"
      : status === "NEEDS_ATTENTION"
        ? "Needs attention"
        : "Missing";
  const classes =
    status === "DONE"
      ? "bg-green-50 text-green-700 border-green-200"
      : status === "NEEDS_ATTENTION"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-gray-50 text-gray-600 border-gray-200";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${classes}`}>
      {label}
    </span>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h2 className="text-sm font-semibold text-gray-800 mb-4">{title}</h2>
      {children}
    </section>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | number | null;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-50 py-2 last:border-0">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <span className={`text-right text-xs text-gray-800 ${mono ? "font-mono" : ""}`}>
        {value ?? "Not recorded"}
      </span>
    </div>
  );
}

function buildUserColumns(params: {
  actorUserId: string;
  actorRole: ClientSetupUserRow["role"];
  targetOrganizationId: string;
}): DataTableColumn<ClientSetupUserRow>[] {
  return [
    {
      header: "User",
      cell: (row) => (
        <div>
          <p className="text-sm font-medium text-gray-900">
            {row.name ?? "Name not recorded"}
          </p>
          <p className="text-xs text-gray-500">{row.email}</p>
        </div>
      ),
    },
    {
      header: "Role",
      cell: (row) => <StatusBadge status={row.role} />,
    },
    {
      header: "Membership",
      cell: () => <StatusBadge status="ACTIVE" />,
    },
    {
      header: "Password",
      cell: (row) => (
        <span className="text-xs text-gray-500">
          {row.mustChangePassword ? "Must change password" : "Changed"}
        </span>
      ),
    },
    {
      header: "Created",
      cell: (row) => (
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {formatDateTime(row.createdAt)}
        </span>
      ),
    },
    {
      header: "Actions",
      cell: (row) => (
        <StaffPasswordResetForm
          targetUserId={row.id}
          targetOrganizationId={params.targetOrganizationId}
          targetName={row.name}
          targetEmail={row.email}
          targetRole={row.role}
          canReset={canResetStaffPassword({
            actorRole: params.actorRole,
            targetRole: row.role,
            actorUserId: params.actorUserId,
            targetUserId: row.id,
          })}
        />
      ),
    },
  ];
}

const API_KEY_COLUMNS: DataTableColumn<ClientSetupApiKeyRow>[] = [
  {
    header: "Key",
    cell: (row) => (
      <div>
        <p className="text-sm font-medium text-gray-900">{row.name}</p>
        <p className="font-mono text-xs text-gray-400">{row.id}</p>
      </div>
    ),
  },
  {
    header: "Prefix",
    cell: (row) => (
      <span className="font-mono text-xs text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded">
        {row.keyPrefix}...
      </span>
    ),
  },
  {
    header: "Status",
    cell: (row) => <StatusBadge status={row.status} />,
  },
  {
    header: "Client",
    cell: (row) => (
      <span className="text-xs text-gray-500">
        {row.clientName ?? "Organization-level"}
      </span>
    ),
  },
  {
    header: "Last Used",
    cell: (row) => (
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {formatDateTime(row.lastUsedAt)}
      </span>
    ),
  },
  {
    header: "Created",
    cell: (row) => (
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {formatDateTime(row.createdAt)}
      </span>
    ),
  },
];

function EmptyMiniState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center">
      <p className="text-xs text-gray-500">{message}</p>
    </div>
  );
}

function Checklist({ items }: { items: SetupChecklistItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {items.map((item) => (
        <div key={item.key} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-gray-800">{item.label}</p>
            <ChecklistPill status={item.status} />
          </div>
          <p className="text-xs text-gray-500">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}

async function ClientDetailContent({ organizationId }: { organizationId: string }) {
  const context = await requireDashboardRole(getAllowedDashboardRoles("clients"));
  const detail = await getPlatformClientSetupDetail({ context, organizationId });

  if (!detail) {
    notFound();
  }

  const userColumns = buildUserColumns({
    actorUserId: context.user.id,
    actorRole: context.membership.role,
    targetOrganizationId: detail.organization.id,
  });

  return (
    <>
      <DashboardHeader
        title={detail.organization.name}
        subtitle="Platform-admin setup checklist and client company health summary."
        action={
          <Link
            href="/dashboard/clients"
            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Back to Clients
          </Link>
        }
      />

      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <SetupStatusPill status={detail.overallStatus} />
              <span className="text-xs text-gray-500">
                Created {formatDateTime(detail.organization.createdAt)}
              </span>
            </div>
            <p className="font-mono text-xs text-gray-400">
              {detail.organization.id}
            </p>
          </div>
          <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800 md:max-w-md">
            <p className="font-semibold">Recommended next action</p>
            <p className="mt-1 text-xs leading-relaxed">
              {detail.recommendedNextAction}
            </p>
          </div>
        </div>
      </div>

      <Checklist items={detail.checklist} />

      <div className="my-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <DashboardCard
          title="Total Sales"
          value={detail.activity.totalSales}
          tone="blue"
        />
        <DashboardCard
          title="Pending Sales"
          value={detail.activity.pendingSales}
          tone="amber"
        />
        <DashboardCard
          title="Completed Verifications"
          value={detail.activity.completedVerifications}
          tone="green"
        />
        <DashboardCard
          title="Declined Verifications"
          value={detail.activity.declinedVerifications}
          tone="red"
        />
        <DashboardCard
          title="Certificates"
          value={detail.activity.certificates}
          tone="violet"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard title="Organisation Details">
          <DetailRow label="Organisation name" value={detail.organization.name} />
          <DetailRow label="Organisation ID" value={detail.organization.id} mono />
          <DetailRow label="Slug" value={detail.organization.slug} />
          <DetailRow label="Created" value={formatDateTime(detail.organization.createdAt)} />
          <DetailRow label="Membership count" value={detail.membershipCount} />
          <DetailRow label="Client row name" value={detail.client?.name ?? null} />
          <DetailRow label="Client ID" value={detail.client?.id ?? null} mono />
          <DetailRow label="Primary contact" value={detail.organization.primaryContactName} />
          <DetailRow label="Primary contact email" value={detail.organization.primaryContactEmail} />
          <DetailRow label="Primary contact phone" value={detail.organization.primaryContactPhone} />
        </SectionCard>

        <SectionCard title="Webhook Setup">
          <DetailRow
            label="Endpoint"
            value={detail.webhook.configured ? "Configured" : "Not configured"}
          />
          <DetailRow label="Destination host" value={detail.webhook.destinationHost} />
          <DetailRow label="Client row" value={detail.webhook.clientName} />
          <DetailRow label="Last delivery status" value={detail.webhook.lastDeliveryStatus} />
          <DetailRow label="Last delivery activity" value={formatDateTime(detail.webhook.lastDeliveryAt)} />
          <DetailRow label="Failure count" value={detail.webhook.failureCount} />
          <p className="mt-4 text-xs leading-relaxed text-gray-500">
            Webhook secrets and full destination URLs are intentionally hidden.
          </p>
        </SectionCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard title="Client Admins">
          {detail.admins.length > 0 ? (
            <DataTable
              columns={userColumns}
              rows={detail.admins}
              footer="Showing client owner/admin membership metadata only."
            />
          ) : (
            <EmptyMiniState message="No client owner/admin user has been created for this organization yet." />
          )}
        </SectionCard>

        <SectionCard title="Staff And Sellers">
          <div className="mb-3 text-xs text-gray-500">
            {detail.staff.length} staff/seller memberships
          </div>
          {detail.staff.length > 0 ? (
            <DataTable
              columns={userColumns}
              rows={detail.staff}
              footer="Showing staff membership metadata only."
            />
          ) : (
            <EmptyMiniState message="No staff, seller, manager, or compliance viewer users yet." />
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="API Keys">
          <div className="mb-4 flex flex-wrap gap-2 text-xs text-gray-500">
            <span className="rounded-full border border-gray-200 px-3 py-1">
              Total: {detail.apiKeys.total}
            </span>
            <span className="rounded-full border border-gray-200 px-3 py-1">
              Active: {detail.apiKeys.active}
            </span>
            <span className="rounded-full border border-gray-200 px-3 py-1">
              Revoked: {detail.apiKeys.revoked}
            </span>
          </div>
          {detail.apiKeys.rows.length > 0 ? (
            <DataTable
              columns={API_KEY_COLUMNS}
              rows={detail.apiKeys.rows}
              footer="Showing safe API key metadata only. Raw keys and hashes are never shown."
            />
          ) : (
            <EmptyMiniState message="No dashboard-managed API keys have been created for this organization yet." />
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Activity">
          <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
            <DetailRow label="Last sale intake" value={formatDateTime(detail.activity.lastSaleAt)} />
            <DetailRow label="Last verification session" value={formatDateTime(detail.activity.lastVerificationAt)} />
            <DetailRow label="Last completed verification" value={formatDateTime(detail.activity.lastCompletedVerificationAt)} />
            <DetailRow label="Last certificate" value={formatDateTime(detail.activity.lastCertificateAt)} />
            <DetailRow label="Total sales" value={detail.activity.totalSales} />
            <DetailRow label="Pending sales" value={detail.activity.pendingSales} />
            <DetailRow label="Completed verifications" value={detail.activity.completedVerifications} />
            <DetailRow label="Declined verifications" value={detail.activity.declinedVerifications} />
            <DetailRow label="Certificates" value={detail.activity.certificates} />
          </div>
        </SectionCard>
      </div>
    </>
  );
}

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { organizationId } = await params;

  return (
    <DashboardRoleGate section="clients">
      <ClientDetailContent organizationId={organizationId} />
    </DashboardRoleGate>
  );
}
