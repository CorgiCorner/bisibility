// Skeleton for /app/rank-tracker. Mirrors the compact scope, saved-view, filter toolbar,
// weekly summary, and viewport-sized keyword table.

import { PageContent } from "@/components/shell/PageContent";
import { SummaryStrip } from "@/components/ui";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-[10px] bg-bg-sunken", className)} />;
}

const headerKeys = ["c1", "c2", "c3", "c4", "c5", "c6", "c7"] as const;
const rowKeys = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"] as const;
const rowGrid = "grid grid-cols-[28px_minmax(0,2.4fr)_repeat(5,minmax(0,1fr))] items-center gap-3";

export default function KeywordsLoading() {
  return (
    <PageContent aria-hidden>
      <div className="grid gap-4">
        <div className="flex gap-1 border-b border-border-strong">
          <Bar className="mb-2 h-[26px] w-[118px]" />
          <Bar className="mb-2 h-[26px] w-[104px]" />
          <Bar className="mb-2 h-[26px] w-[86px]" />
        </div>
        <div className="overflow-hidden rounded-[14px] border border-border bg-bg-elev">
          <div className="grid gap-3 border-b border-border px-4 py-[14px] xl:flex xl:items-center">
            <div className="flex items-center gap-2">
              <Bar className="h-[34px] w-[126px]" />
              <Bar className="h-[34px] w-[238px]" />
            </div>
            <div className="hidden h-8 w-px bg-border-strong xl:block" />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Bar className="hidden h-[34px] w-[140px] sm:block" />
              <Bar className="h-[34px] min-w-[220px] flex-1" />
              <Bar className="h-[34px] w-[190px]" />
            </div>
          </div>
          <SummaryStrip className="rounded-none border-b border-border" loading />
          <div className="min-w-0 overflow-x-auto">
            <div className="h-[650px] min-h-[420px] max-h-[calc(100dvh-200px)] min-w-[1080px]">
              <div className={cn(rowGrid, "border-b border-border bg-bg-sunken px-4 py-2.5")}>
                {headerKeys.map((key) => (
                  <div className="h-2.5 w-12 rounded bg-border" key={key} />
                ))}
              </div>
              {rowKeys.map((key) => (
                <div className={cn(rowGrid, "border-b border-border-soft px-4 py-3.5")} key={key}>
                  <Bar className="h-4 w-4 rounded" />
                  <Bar className="h-3.5 w-[72%]" />
                  <Bar className="h-3.5 w-10" />
                  <Bar className="h-3.5 w-12" />
                  <Bar className="h-5 w-16 rounded-md" />
                  <Bar className="h-3.5 w-12" />
                  <Bar className="h-3.5 w-14" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageContent>
  );
}
