// Skeleton for the project Dashboard. Mirrors OverviewSections: the full-bleed toolbar (filter
// pills + add action), a four-up KPI grid, the position trend / distribution chart row,
// and the data source panel, so navigation shows the real layout, not an empty slot.

import { PageContent } from "@/components/shell/PageContent";
import { ConclusionSubtitle } from "@/components/ui";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-[10px] bg-bg-sunken", className)} />;
}

const kpiKeys = ["k1", "k2", "k3", "k4"] as const;
const metricKeys = ["m1", "m2", "m3", "m4"] as const;
const distBars = [
  { height: "h-[35%]", key: "d1" },
  { height: "h-[72%]", key: "d2" },
  { height: "h-[90%]", key: "d3" },
  { height: "h-[58%]", key: "d4" },
  { height: "h-[40%]", key: "d5" },
  { height: "h-[24%]", key: "d6" },
] as const;

const chartCardClass = "rounded-[14px] border border-border bg-bg-elev px-5 py-[18px]";

export default function OverviewLoading() {
  return (
    <PageContent aria-hidden>
      <div className="-mx-4 -mt-4 mb-[22px] sm:-mx-5 lg:-mx-7 lg:-mt-[22px]">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-bg px-4 py-[11px] sm:px-5 lg:px-7">
          <div className="flex min-w-0 items-center gap-2">
            <Bar className="h-9 w-[132px] rounded-full" />
            <Bar className="h-9 w-[118px] rounded-full" />
            <Bar className="h-9 w-[104px] rounded-full" />
          </div>
          <Bar className="h-10 w-[124px] flex-none" />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-[18px]">
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-[repeat(4,minmax(0,1fr))]">
          {kpiKeys.map((key) => (
            <div
              className="min-w-0 rounded-[13px] border border-border bg-bg-elev px-[18px] py-4"
              key={key}
            >
              <Bar className="h-2.5 w-[68px]" />
              <div className="mt-[11px] flex items-end gap-2">
                <Bar className="h-7 w-[84px]" />
                <Bar className="h-3 w-9" />
              </div>
            </div>
          ))}
        </section>

        <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
          <div className={cn(chartCardClass, "min-w-0")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Bar className="h-4 w-[120px]" />
                <ConclusionSubtitle loading />
                <Bar className="mt-2 h-3 w-[230px]" />
              </div>
              <Bar className="h-3 w-[92px] flex-none" />
            </div>
            <Bar className="mt-3 h-[250px] w-full rounded-xl" />
          </div>

          <div className={cn(chartCardClass, "min-w-0")}>
            <Bar className="h-4 w-[150px]" />
            <Bar className="mt-2 h-3 w-[180px]" />
            <div className="mt-[18px] flex h-[190px] items-end gap-2.5 px-1">
              {distBars.map((bar) => (
                <Bar className={cn("w-full rounded-md", bar.height)} key={bar.key} />
              ))}
            </div>
          </div>
        </section>

        <div className={chartCardClass}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Bar className="h-4 w-[120px]" />
              <Bar className="mt-2 h-3 w-[260px]" />
            </div>
            <Bar className="h-7 w-[96px] flex-none rounded-full" />
          </div>
          <div className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-[18px] gap-y-3.5">
            {metricKeys.map((key) => (
              <div className="min-w-0" key={key}>
                <Bar className="h-2.5 w-[72px]" />
                <Bar className="mt-[7px] h-3.5 w-[96px]" />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-[9px] border-t border-border-soft pt-3.5">
            <Bar className="h-5 w-5 shrink-0 rounded-md" />
            <Bar className="h-3 w-full max-w-[440px]" />
          </div>
        </div>
      </div>
    </PageContent>
  );
}
