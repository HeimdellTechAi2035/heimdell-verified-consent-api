export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="h-7 w-48 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-80 max-w-full rounded bg-gray-100" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-gray-100" />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="h-3 w-20 rounded bg-gray-100" />
            <div className="mt-4 h-8 w-16 rounded bg-gray-200" />
            <div className="mt-3 h-3 w-24 rounded bg-gray-100" />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-5">
          <div className="h-4 w-36 rounded bg-gray-200" />
        </div>
        <div className="space-y-3 p-5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4">
              <div className="h-4 flex-1 rounded bg-gray-100" />
              <div className="h-4 w-24 rounded bg-gray-100" />
              <div className="h-4 w-16 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
