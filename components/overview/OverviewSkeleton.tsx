// Shared pulsing skeleton for the overview: toolbar, four KPI cards, the trend +
// distribution charts, and the keyword preview. Used by both the (workspace)
// segment loading boundary and the overview page's Suspense fallback so cold loads
// and in-page data resolution look identical (no crude "Loading overview" state).

function Bar({ className }: Readonly<{ className?: string }>) {
  return <div className={`animate-pulse rounded-[12px] bg-bg-sunken ${className ?? ""}`} />;
}

const kpiKeys = ["kpi-1", "kpi-2", "kpi-3", "kpi-4"] as const;

export function OverviewSkeleton() {
  return (
    <div aria-hidden className="flex min-w-0 flex-col gap-[18px]">
      <div className="flex flex-wrap items-center gap-3">
        <Bar className="h-9 w-[120px]" />
        <Bar className="h-9 w-[120px]" />
        <Bar className="h-9 w-[104px]" />
        <Bar className="ml-auto h-10 w-[128px]" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpiKeys.map((key) => (
          <Bar className="h-[94px]" key={key} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.85fr_1fr]">
        <Bar className="h-[260px]" />
        <Bar className="h-[260px]" />
      </div>
      <Bar className="h-40" />
    </div>
  );
}
