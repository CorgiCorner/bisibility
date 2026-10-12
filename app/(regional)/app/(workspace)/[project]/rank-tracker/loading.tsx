// Skeleton for /app/rank-tracker. Mirrors the compact scope, saved-view, filter toolbar,
// and viewport-sized keyword table.

import { PageContent } from "@/components/shell/PageContent";
import { tableHeaderClassName } from "@/components/ui/table-header-styles";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-control bg-bg-sunken", className)} />;
}

const headerKeys = ["c1", "c2", "c3", "c4", "c5", "c6", "c7"] as const;
const rowKeys = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"] as const;
const rowGrid = "grid grid-cols-[28px_minmax(0,2.4fr)_repeat(5,minmax(0,1fr))] items-center gap-3";

export default function KeywordsLoading() {
  return (
    <PageContent aria-hidden>
      <div className="grid gap-4">
        <div className="flex gap-1 border-b border-border">
          <Bar className="mb-2 h-[26px] w-[118px]" />
          <Bar className="mb-2 h-[26px] w-[104px]" />
          <Bar className="mb-2 h-[26px] w-[86px]" />
        </div>
        <div className="overflow-hidden rounded-card border border-border bg-bg-elev">
          <div className="grid gap-3 px-4 py-3.5" data-keywords-toolbar="">
            <div className="order-2 flex flex-wrap items-center gap-2 lg:order-1">
              <Bar className="hidden h-8.5 w-[126px] lg:block" />
              <Bar className="hidden h-8.5 w-[136px] sm:block" />
              <Bar className="h-8.5 w-8.5 lg:w-27.5" />
            </div>
            <div className="order-1 flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center lg:order-2">
              <Bar className="h-8.5 w-full min-w-0 sm:flex-1" />
              <Bar className="h-8.5 w-62 self-end sm:w-47.5 sm:self-auto" />
            </div>
          </div>
          <div className="min-w-0 overflow-x-auto">
            <div className="h-[650px] min-h-[420px] max-h-[calc(100dvh-200px)] min-w-[1080px]">
              <div className={cn(tableHeaderClassName, rowGrid, "h-10.5 px-4")}>
                {headerKeys.map((key) => (
                  <div className="h-2.5 w-12 rounded bg-border" key={key} />
                ))}
              </div>
              {rowKeys.map((key) => (
                <div className={cn(rowGrid, "border-b border-border px-4 py-3.5")} key={key}>
                  <Bar className="h-4 w-4 rounded" />
                  <Bar className="h-3.5 w-[72%]" />
                  <Bar className="h-3.5 w-10" />
                  <Bar className="h-3.5 w-12" />
                  <Bar className="h-5 w-16 rounded-control" />
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
