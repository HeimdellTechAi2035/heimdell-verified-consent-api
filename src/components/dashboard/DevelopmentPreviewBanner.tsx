// DevelopmentPreviewBanner - reusable amber warning banner for unfinished areas.

export function DevelopmentPreviewBanner({
  message,
}: {
  message?: string;
}) {
  return (
    <div className="mb-6 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
      <svg
        className="w-5 h-5 text-amber-500 shrink-0 mt-0.5"
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
      <p className="text-sm text-amber-800">
        <span className="font-semibold">
          This area is still being prepared for production use.
        </span>
        {message && <span> {message}</span>}
      </p>
    </div>
  );
}
