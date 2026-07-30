// Skeleton for /app/keywords/[id]. Mirrors the keyword detail stack: back link, header
// card (title + id chip + dimension chips + action buttons), the metric cards row, the
// position history chart card with range tabs, and the ranking URL timeline card.

import { PageContent } from "@/components/shell/PageContent";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-[10px] bg-bg-sunken", className)} />;
}

const chipKeys = ["loc", "device", "engine", "tag"] as const;
const actionWidths = [
  { key: "alert", width: "w-[104px]" },
  { key: "export", width: "w-[116px]" },
  { key: "edit", width: "w-[72px]" },
  { key: "check", width: "w-[130px]" },
] as const;
const metricKeys = ["pos", "best", "vol", "cpc", "kd", "pages"] as const;
const rangeKeys = ["7d", "30d", "90d"] as const;
const timelineKeys = ["t1", "t2", "t3", "t4", "t5"] as const;

const cardLgClass = "rounded-[14px] border border-border bg-bg-elev p-5";

export default function KeywordDetailLoading() {
  return (
    <PageContent aria-hidden className="grid gap-4">
      <div className="flex items-center gap-2">
        <Bar className="h-3.5 w-3.5 rounded" />
        <Bar className="h-3 w-[88px]" />
      </div>

      <div className={cardLgClass}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
              <Bar className="h-6 w-[210px]" />
              <Bar className="h-5 w-[64px] rounded-md" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-[7px]">
              {chipKeys.map((key) => (
                <Bar className="h-[26px] w-[96px] rounded-full" key={key} />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {actionWidths.map((action) => (
              <Bar className={cn("h-9", action.width)} key={action.key} />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {metricKeys.map((key) => (
          <div className="rounded-xl border border-border bg-bg-elev px-4 py-3.5" key={key}>
            <Bar className="h-2.5 w-[64px]" />
            <Bar className="mt-2.5 h-6 w-[72px]" />
          </div>
        ))}
      </div>

      <div className={cardLgClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Bar className="h-4 w-[150px]" />
            <Bar className="mt-2 h-3 w-[250px]" />
          </div>
          <div className="flex items-center gap-0.5 rounded-[9px] border border-border-strong bg-bg-elev p-0.5">
            {rangeKeys.map((key) => (
              <Bar className="h-7 w-[42px] rounded-[7px]" key={key} />
            ))}
          </div>
        </div>
        <Bar className="mt-3 h-[280px] w-full rounded-xl" />
      </div>

      <div className="overflow-hidden rounded-[14px] border border-border bg-bg-elev">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <Bar className="h-4 w-[180px]" />
            <Bar className="mt-2 h-3 w-[260px]" />
          </div>
          <Bar className="h-5 w-[96px] flex-none rounded-full" />
        </div>
        {timelineKeys.map((key) => (
          <div
            className="flex items-center gap-[14px] border-b border-border-soft px-5 py-[13px] last:border-b-0"
            key={key}
          >
            <span className="flex w-[18px] flex-none justify-center">
              <Bar className="h-[9px] w-[9px] rounded-full" />
            </span>
            <Bar className="h-3 w-[108px] flex-none" />
            <Bar className="h-3 min-w-0 flex-1" />
            <Bar className="h-3.5 w-10 flex-none" />
          </div>
        ))}
      </div>
    </PageContent>
  );
}
