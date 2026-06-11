// DashboardCard — summary metric card used in KPI grids.

export type DashboardCardTone =
  | "blue"
  | "green"
  | "amber"
  | "red"
  | "violet"
  | "gray";

const TONE_MAP: Record<DashboardCardTone, { label: string; value: string }> = {
  blue:   { label: "text-blue-600",   value: "text-blue-700"   },
  green:  { label: "text-green-600",  value: "text-green-700"  },
  amber:  { label: "text-amber-600",  value: "text-amber-700"  },
  red:    { label: "text-red-600",    value: "text-red-700"    },
  violet: { label: "text-violet-600", value: "text-violet-700" },
  gray:   { label: "text-gray-500",   value: "text-gray-700"   },
};

export function DashboardCard({
  title,
  value,
  description,
  tone = "gray",
}: {
  title: string;
  value: number | string;
  description?: string;
  tone?: DashboardCardTone;
}) {
  const colors = TONE_MAP[tone];
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <p className={`text-xs font-semibold uppercase tracking-wider ${colors.label} mb-1`}>
        {title}
      </p>
      <p className={`text-3xl font-bold mt-2 ${colors.value}`}>{value}</p>
      {description && (
        <p className="text-xs text-gray-400 mt-2">{description}</p>
      )}
    </div>
  );
}
