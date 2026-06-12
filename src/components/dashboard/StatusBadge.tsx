// StatusBadge — pill badge for all Heimdell status values.

type Status =
  | "PENDING"
  | "SENDING"
  | "OPENED"
  | "COMPLETED"
  | "VERIFIED"
  | "DECLINED"
  | "EXPIRED"
  | "FAILED"
  | "QUEUED"
  | "SKIPPED"
  | "SENT"
  | "ERROR"
  | "ACTIVE"
  | "ARCHIVED"
  | "INACTIVE"
  | "REVOKED";

type StatusMeta = { label: string; dot: string; badge: string };

const STATUS_MAP: Record<Status, StatusMeta> = {
  PENDING:   { label: "Pending",   dot: "bg-gray-400",    badge: "bg-gray-100 text-gray-600 border-gray-200"    },
  SENDING:   { label: "Sending",   dot: "bg-blue-500",    badge: "bg-blue-50 text-blue-700 border-blue-200"    },
  OPENED:    { label: "Opened",    dot: "bg-blue-400",    badge: "bg-blue-50 text-blue-700 border-blue-200"    },
  COMPLETED: { label: "Completed", dot: "bg-green-500",   badge: "bg-green-50 text-green-700 border-green-200"  },
  VERIFIED:  { label: "Verified",  dot: "bg-green-500",   badge: "bg-green-50 text-green-700 border-green-200"  },
  DECLINED:  { label: "Declined",  dot: "bg-red-500",     badge: "bg-red-50 text-red-700 border-red-200"       },
  EXPIRED:   { label: "Expired",   dot: "bg-amber-400",   badge: "bg-amber-50 text-amber-700 border-amber-200"  },
  FAILED:    { label: "Failed",    dot: "bg-red-600",     badge: "bg-red-100 text-red-700 border-red-200"      },
  QUEUED:    { label: "Queued",    dot: "bg-amber-400",   badge: "bg-amber-100 text-amber-700 border-amber-200" },
  SKIPPED:   { label: "Skipped",   dot: "bg-gray-400",    badge: "bg-gray-100 text-gray-500 border-gray-200"   },
  SENT:      { label: "Sent",      dot: "bg-green-500",   badge: "bg-green-100 text-green-700 border-green-200" },
  ERROR:     { label: "Error",     dot: "bg-red-600",     badge: "bg-red-100 text-red-700 border-red-200"      },
  ACTIVE:    { label: "Active",    dot: "bg-green-500",   badge: "bg-green-100 text-green-700 border-green-200" },
  ARCHIVED:  { label: "Archived",  dot: "bg-amber-500",   badge: "bg-amber-50 text-amber-700 border-amber-200" },
  INACTIVE:  { label: "Inactive",  dot: "bg-gray-400",    badge: "bg-gray-100 text-gray-500 border-gray-200"   },
  REVOKED:   { label: "Revoked",   dot: "bg-red-500",     badge: "bg-red-50 text-red-700 border-red-200"       },
};

const FALLBACK: StatusMeta = {
  label: "",
  dot: "bg-gray-400",
  badge: "bg-gray-100 text-gray-600 border-gray-200",
};

export function StatusBadge({ status }: { status: string }) {
  const meta = (STATUS_MAP as Record<string, StatusMeta>)[status] ?? {
    ...FALLBACK,
    label: status,
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border ${meta.badge}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
