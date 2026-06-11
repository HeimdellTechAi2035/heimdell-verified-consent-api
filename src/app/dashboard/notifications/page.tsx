// Dashboard -- Notifications page (Phase 12C).
// Placeholder table: connects to database in a future phase.

import { DevelopmentPreviewBanner } from "@/components/dashboard/DevelopmentPreviewBanner";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { DataTable, type DataTableColumn } from "@/components/dashboard/DataTable";

const CHANNEL_STYLES: Record<string, string> = {
  SMS:      "bg-blue-100 text-blue-700",
  EMAIL:    "bg-violet-100 text-violet-700",
  WHATSAPP: "bg-green-100 text-green-700",
  WEBHOOK:  "bg-orange-100 text-orange-700",
};

type NotifRow = {
  channel:   string;
  recipient: string;
  status:    string;
  event:     string;
  created:   string;
};

const PLACEHOLDER_ROWS: NotifRow[] = [
  { channel: "SMS",     recipient: "+447700900001",            status: "QUEUED",  event: "verification.link_created", created: "2026-05-20 14:00" },
  { channel: "WEBHOOK", recipient: "https://crm.example.com", status: "QUEUED",  event: "verification.completed",    created: "2026-05-20 14:08" },
  { channel: "WEBHOOK", recipient: "https://crm.example.com", status: "QUEUED",  event: "certificate.created",       created: "2026-05-20 14:08" },
  { channel: "SMS",     recipient: "N/A",                      status: "SKIPPED", event: "verification.link_created", created: "2026-05-19 10:00" },
];

const COLUMNS: DataTableColumn<NotifRow>[] = [
  { header: "Channel",   cell: (r) => (
      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${CHANNEL_STYLES[r.channel] ?? "bg-gray-100 text-gray-600"}`}>
        {r.channel}
      </span>
    )
  },
  { header: "Recipient", cell: (r) => <span className="font-mono text-xs text-gray-600 truncate block max-w-[180px]">{r.recipient}</span> },
  { header: "Event",     cell: (r) => <span className="font-mono text-xs text-gray-500">{r.event}</span> },
  { header: "Status",    cell: (r) => <StatusBadge status={r.status} /> },
  { header: "Created",   cell: (r) => <span className="text-xs text-gray-500">{r.created}</span> },
  { header: "Action",    cell: () => (
      <button disabled className="text-xs text-blue-400 cursor-not-allowed" title="Notification detail view is not available yet">
        View
      </button>
    )
  },
];

export default function NotificationsPage() {
  return (
    <DashboardRoleGate section="notifications">
      <DevelopmentPreviewBanner
        message="Live notification log records will appear once PostgreSQL is connected."
      />

      <DashboardHeader
        title="Notifications"
        subtitle="SMS, email, WhatsApp, and webhook delivery log. Nothing is sent yet -- a delivery worker will process QUEUED records when providers are connected."
      />

      {/* Channel legend */}
      <div className="flex flex-wrap gap-3 mb-5">
        {[
          { status: "QUEUED",  label: "Queued - ready for delivery worker" },
          { status: "SENT",    label: "Sent successfully" },
          { status: "FAILED",  label: "Delivery failed" },
          { status: "SKIPPED", label: "Skipped - missing recipient or secret" },
        ].map(({ status, label }) => (
          <div key={status} className="flex items-center gap-1.5 text-xs text-gray-500">
            <StatusBadge status={status} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <DataTable
        columns={COLUMNS}
        rows={PLACEHOLDER_ROWS}
        footer="Showing development placeholder rows -- not from database. Real records are written by the notification layer after each verification event."
      />
    </DashboardRoleGate>
  );
}
