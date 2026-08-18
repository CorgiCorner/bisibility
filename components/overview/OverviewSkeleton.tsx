import { PageContent } from "@/components/shell/PageContent";
import { ConclusionSubtitle } from "@/components/ui";
import { cn } from "@/lib/ui/cn";

// Shared pulsing skeleton for the dashboard. Mirrors OverviewSections: the
// full-bleed toolbar (filter pills + add action), four KPI cards with label /
// value / delta internals, the position trend + distribution chart row, the
// by-market rollup, the data-source panel, four highlight-list cards, and the
// final "View all keywords" action spacing. Used by both the route loading
// boundary and the dashboard page's in-page Suspense fallback so cold loads
// and in-page data resolution look identical.

function Bar({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-[10px] bg-bg-sunken", className)} />;
}

const kpiKeys = ["k1", "k2", "k3", "k4"] as const;
const metricKeys = ["m1", "m2", "m3", "m4"] as const;
const highlightKeys = ["h1", "h2", "h3", "h4"] as const;
const marketRowKeys = ["mr1", "mr2", "mr3"] as const;
const highlightRowKeys = ["hr1", "hr2", "hr3"] as const;
const distBars = [
  { height: "h-[35%]", key: "d1" },
  { height: "h-[72%]", key: "d2" },
  { height: "h-[90%]", key: "d3" },
  { height: "h-[58%]", key: "d4" },
  { height: "h-[40%]", key: "d5" },
  { height: "h-[24%]", key: "d6" },
] as const;

const chartCardClass = "rounded-[14px] border border-border bg-bg-elev px-5 py-4.5";
const marketGrid =
  "grid min-w-[772px] grid-cols-[200px_96px_92px_168px_88px_72px_16px] items-center gap-3 px-5";

export function OverviewSkeleton() {
  return (
    <div aria-hidden>
      <div className="-mx-4 -mt-4 mb-5.5 sm:-mx-5 lg:-mx-7 lg:-mt-5.5">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-bg px-4 py-[11px] sm:px-5 lg:px-7">
          <div className="flex min-w-0 items-center gap-2">
            <Bar className="h-9 w-[132px] rounded-full" />
            <Bar className="h-9 w-[118px] rounded-full" />
            <Bar className="h-9 w-[104px] rounded-full" />
          </div>
          <Bar className="h-10 w-[124px] flex-none" />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4.5">
        <section
          data-testid="overview-kpis"
          className="grid grid-cols-2 gap-4 lg:grid-cols-[repeat(4,minmax(0,1fr))]"
        >
          {kpiKeys.map((key) => (
            <div
              className="min-w-0 rounded-[13px] border border-border bg-bg-elev px-4.5 py-4"
              key={key}
            >
              <Bar className="h-2.5 w-[68px]" />
              <div className="mt-[9px] flex items-end gap-3">
                <Bar className="h-7 w-[84px]" />
                <Bar className="h-3 w-9" />
              </div>
            </div>
          ))}
        </section>

        <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
          <div className={cn(chartCardClass, "flex min-w-0 flex-col")}>
            <div className="flex min-h-[69px] items-start justify-between gap-3">
              <div className="min-w-0">
                <Bar className="h-4 w-[120px]" />
                <ConclusionSubtitle loading />
                <Bar className="mt-2 h-3 w-[230px]" />
              </div>
              <Bar className="h-3 w-[92px] flex-none" />
            </div>
            <Bar className="mt-3 h-[250px] w-full rounded-xl" />
          </div>

          <div className={cn(chartCardClass, "flex min-w-0 flex-col")}>
            <Bar className="h-4 w-[150px]" />
            <Bar className="mt-2 h-3 w-[180px]" />
            <div className="mt-4.5 flex h-[190px] items-end gap-2.5 px-1">
              {distBars.map((bar) => (
                <Bar className={cn("w-full rounded-md", bar.height)} key={bar.key} />
              ))}
            </div>
          </div>
        </section>

        <div
          data-testid="by-market-rollup"
          className="min-w-0 overflow-hidden rounded-[14px] border border-border bg-bg-elev p-0"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3.5 pt-4.5">
            <div className="min-w-0">
              <Bar className="h-4 w-[100px]" />
              <Bar className="mt-2 h-3 w-[180px]" />
            </div>
            <Bar className="h-[30px] w-[130px] flex-none rounded-full" />
          </div>
          <div className="overflow-x-auto">
            <div className={cn(marketGrid, "border-t border-border bg-bg-sunken py-2")}>
              <Bar className="h-2.5 w-[64px]" />
              <Bar className="h-2.5 w-0" />
              <Bar className="ml-auto h-2.5 w-[48px]" />
              <Bar className="h-2.5 w-[80px]" />
              <Bar className="ml-auto h-2.5 w-[48px]" />
              <Bar className="h-2.5 w-[44px]" />
              <Bar className="h-2.5 w-0" />
            </div>
            {marketRowKeys.map((key) => (
              <div
                className={cn(marketGrid, "min-h-[57px] border-t border-border-soft py-3")}
                key={key}
              >
                <Bar className="h-5 w-[140px] rounded-full" />
                <Bar className="h-3 w-[60px]" />
                <Bar className="ml-auto h-3 w-[60px]" />
                <Bar className="h-3 w-[100px]" />
                <Bar className="ml-auto h-3 w-[44px]" />
                <Bar className="h-5 w-[72px]" />
                <Bar className="h-3 w-3" />
              </div>
            ))}
          </div>
        </div>

        <div className={chartCardClass}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Bar className="h-4 w-[120px]" />
              <Bar className="mt-2 h-3 w-[260px]" />
            </div>
            <Bar className="h-7 w-[96px] flex-none rounded-full" />
          </div>
          <div className="mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-4.5 gap-y-3.5">
            {metricKeys.map((key) => (
              <div className="min-w-0" key={key}>
                <Bar className="h-2.5 w-[72px]" />
                <Bar className="mt-[5px] h-3.5 w-[96px]" />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-[9px] border-t border-border-soft pt-3.5">
            <Bar className="h-5 w-5 shrink-0 rounded-md" />
            <Bar className="h-3 w-full max-w-[440px]" />
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
          {highlightKeys.map((key) => (
            <div
              className="flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-border bg-bg-elev p-0"
              key={key}
            >
              <div className="flex-none px-4.5 pb-3 pt-[15px]">
                <div className="flex items-center gap-2">
                  <Bar className="h-4 w-4 rounded-md" />
                  <Bar className="h-4 w-[120px]" />
                </div>
                <Bar className="mt-[3px] h-3 w-[160px]" />
              </div>
              <div className="flex flex-1 flex-col">
                {highlightRowKeys.map((rowKey) => (
                  <div
                    className="flex min-h-[68px] items-center justify-between gap-2.5 border-t border-border-soft px-4.5 py-2.5"
                    key={rowKey}
                  >
                    <div className="min-w-0">
                      <Bar className="h-3 w-[100px]" />
                      <Bar className="mt-1 h-2.5 w-[120px] rounded-full" />
                      <Bar className="mt-1 h-2 w-[140px]" />
                    </div>
                    <Bar className="h-3 w-8" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <Bar className="h-[38px] w-[160px] self-start rounded-full" />
      </div>
    </div>
  );
}

export function OverviewPageLoading() {
  return (
    <PageContent aria-hidden>
      <OverviewSkeleton />
    </PageContent>
  );
}
