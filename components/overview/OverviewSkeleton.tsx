// Shared pulsing skeleton for the overview: toolbar, four KPI cards, the trend +
// distribution charts, and the keyword preview. Used by both the (workspace)
// segment loading boundary and the overview page's Suspense fallback so cold loads
// and in-page data resolution look identical (no crude "Loading overview" state).

// Two different shapes, because the settled layout has two. Controls are solid pills;
// panels are Card-shaped - same radius, same border, same elevated fill - so the only
// thing that changes when data lands is the content INSIDE the frame. Filling the panels
// solid made the whole page jump the moment it resolved.
function Pill({ className }: Readonly<{ className?: string }>) {
  return <div className={`animate-pulse rounded-[9px] bg-bg-sunken ${className ?? ""}`} />;
}

function Panel({ className }: Readonly<{ className?: string }>) {
  return (
    <div className={`rounded-[14px] border border-border bg-bg-elev p-4 ${className ?? ""}`}>
      <div className="h-full animate-pulse rounded-[9px] bg-bg-sunken" />
    </div>
  );
}

const kpiKeys = ["kpi-1", "kpi-2", "kpi-3", "kpi-4"] as const;

export function OverviewSkeleton() {
  return (
    <div aria-hidden className="flex min-w-0 flex-col gap-[18px]">
      <div className="flex flex-wrap items-center gap-3">
        <Pill className="h-9 w-[120px]" />
        <Pill className="h-9 w-[120px]" />
        <Pill className="h-9 w-[104px]" />
        <Pill className="ml-auto h-10 w-[128px]" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpiKeys.map((key) => (
          <Panel className="h-[94px]" key={key} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.85fr_1fr]">
        <Panel className="h-[260px]" />
        <Panel className="h-[260px]" />
      </div>
      <Panel className="h-40" />
    </div>
  );
}
