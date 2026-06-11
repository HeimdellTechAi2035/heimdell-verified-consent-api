// Embed status badge -- compact pill for use inside CRM iframe panels.
// Maps verification session status to label + colour.

export type EmbedStatus =
  | "PENDING"
  | "OPENED"
  | "COMPLETED"
  | "DECLINED"
  | "EXPIRED";

type StatusMeta = { label: string; dot: string; badge: string };

const STATUS_META: Record<EmbedStatus, StatusMeta> = {
  PENDING:   { label: "Pending",   dot: "bg-gray-400",  badge: "bg-gray-100 text-gray-600 border-gray-200"   },
  OPENED:    { label: "Opened",    dot: "bg-blue-400",  badge: "bg-blue-50 text-blue-700 border-blue-200"    },
  COMPLETED: { label: "Verified",  dot: "bg-green-500", badge: "bg-green-50 text-green-700 border-green-200" },
  DECLINED:  { label: "Declined",  dot: "bg-red-500",   badge: "bg-red-50 text-red-700 border-red-200"       },
  EXPIRED:   { label: "Expired",   dot: "bg-amber-400", badge: "bg-amber-50 text-amber-700 border-amber-200" },
};

export function EmbedStatusBadge({ status }: { status: EmbedStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border ${meta.badge}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
