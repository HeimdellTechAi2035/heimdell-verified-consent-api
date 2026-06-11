// EmptyState - shown when a protected dashboard section has no records to display.

export function EmptyState({
  title = "No data yet",
  detail,
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-white rounded-2xl border border-dashed border-gray-200">
      {/* Icon */}
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <svg
          className="w-6 h-6 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
          />
        </svg>
      </div>

      <h3 className="text-sm font-semibold text-gray-700 mb-1">{title}</h3>

      <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
        {detail ??
          "Records will appear here once this organization has matching activity."}
      </p>

      <div className="mt-5 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
        <svg
          className="w-3.5 h-3.5 text-amber-500 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z"
          />
        </svg>
        <p className="text-xs text-amber-700 font-medium">
          No matching tenant-scoped records
        </p>
      </div>
    </div>
  );
}
