import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { DataTable, type DataTableColumn } from "@/components/dashboard/DataTable";
import { requireOrganizationMembership } from "@/lib/dashboard-auth";
import {
  getDashboardNotificationsData,
  normalizeDashboardNotificationStatus,
  type DashboardNotificationRow,
} from "@/lib/dashboard-notifications";

type NotificationsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const CHANNEL_STYLES: Record<string, string> = {
  SMS: "bg-blue-100 text-blue-700",
  EMAIL: "bg-violet-100 text-violet-700",
  WHATSAPP: "bg-green-100 text-green-700",
  WEBHOOK: "bg-orange-100 text-orange-700",
};

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const COLUMNS: DataTableColumn<DashboardNotificationRow>[] = [
  {
    header: "Channel",
    cell: (r) => (
      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${CHANNEL_STYLES[r.channel] ?? "bg-gray-100 text-gray-600"}`}>
        {r.channel}
      </span>
    ),
  },
  {
    header: "Recipient",
    cell: (r) => (
      <div>
        <p className="font-mono text-xs text-gray-600 truncate max-w-[220px]">
          {r.recipient}
        </p>
        <p className="mt-0.5 text-xs text-gray-400">{r.customerName}</p>
      </div>
    ),
  },
  {
    header: "Type",
    cell: (r) => (
      <div>
        <p className="text-xs font-semibold text-gray-700">{r.notificationType}</p>
        <p className="mt-0.5 text-xs text-gray-400">{r.subject ?? "No subject"}</p>
      </div>
    ),
  },
  {
    header: "Status",
    cell: (r) => (
      <div className="space-y-1">
        <StatusBadge status={r.status} />
        {r.nextAttemptAt && (
          <p className="text-xs text-amber-700">
            Retry scheduled {formatDateTime(r.nextAttemptAt)}
          </p>
        )}
      </div>
    ),
  },
  {
    header: "Preview / error",
    cell: (r) => (
      <div className="max-w-[260px]">
        <p className="truncate text-xs text-gray-600">
          {r.messagePreview ?? "No preview stored"}
        </p>
        {r.safeError && (
          <p className="mt-1 truncate text-xs text-red-600">{r.safeError}</p>
        )}
      </div>
    ),
  },
  {
    header: "Attempts",
    cell: (r) => (
      <span className="text-xs text-gray-500">
        {r.attempts}/{r.maxAttempts}
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
    header: "Sent/Failed",
    cell: (r) => (
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {formatDateTime(r.sentAt ?? r.failedAt)}
      </span>
    ),
  },
  {
    header: "Related",
    cell: (r) => (
      <div className="flex flex-col gap-1">
        <Link
          className="text-xs font-semibold text-blue-600"
          href={`/dashboard/sales/${encodeURIComponent(r.saleId)}`}
        >
          View sale
        </Link>
        {r.verificationSessionId && (
          <Link
            className="text-xs font-semibold text-gray-600"
            href={`/dashboard/verifications/${encodeURIComponent(r.verificationSessionId)}`}
          >
            View verification
          </Link>
        )}
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

function EmptyState() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">
        No notifications yet
      </h3>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-gray-500">
        Notification records will appear after verification links are created,
        customers complete or decline verification, or webhooks are queued.
      </p>
    </div>
  );
}

async function NotificationsContent({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const status = normalizeDashboardNotificationStatus(
    firstQueryValue(resolvedSearchParams.status)
  );
  const context = await requireOrganizationMembership();
  const rows = await getDashboardNotificationsData(context, { status });

  return (
    <>
      <DashboardHeader
        title="Notifications"
        subtitle="Customer delivery and webhook notification tracking for this organization."
      />

      <div className="mb-5 flex flex-wrap gap-3">
        {[
          ["", "All"],
          ["QUEUED", "Pending"],
          ["SENDING", "Sending"],
          ["SENT", "Sent"],
          ["FAILED", "Failed"],
          ["SKIPPED", "Skipped"],
        ].map(([value, label]) => (
          <Link
            key={value || "all"}
            href={value ? `/dashboard/notifications?status=${value}` : "/dashboard/notifications"}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              status === value || (!status && !value)
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-gray-200 bg-white text-gray-600"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <DataTable
          columns={COLUMNS}
          rows={rows}
          footer="Showing safe notification fields only. Provider secrets, secure link internals, and full payment details are never shown."
        />
      )}
    </>
  );
}

export default function NotificationsPage({
  searchParams,
}: NotificationsPageProps) {
  return (
    <DashboardRoleGate section="notifications">
      <NotificationsContent searchParams={searchParams} />
    </DashboardRoleGate>
  );
}
