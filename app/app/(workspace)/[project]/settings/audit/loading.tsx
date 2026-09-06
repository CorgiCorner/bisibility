// Skeleton for /app/settings/audit. Mirrors AuditLogView: one card containing the filter
// toolbar and append-only log grid, followed by the retention footer line.

import { PageContent } from "@/components/shell/PageContent";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-control bg-bg-sunken", className)} />;
}

const selectKeys = ["date", "event", "actor", "status"] as const;
const headerKeys = ["h1", "h2", "h3", "h4", "h5"] as const;
const rowKeys = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"] as const;
const rowGrid =
  "grid grid-cols-[minmax(132px,0.9fr)_minmax(148px,1.2fr)_minmax(168px,1.4fr)_minmax(72px,0.6fr)_minmax(72px,0.6fr)] items-center gap-4";

export default function AuditLoading() {
  return (
    <PageContent aria-hidden className="flex flex-col gap-3.5" variant="analytics">
      <div className="overflow-hidden rounded-card border border-border bg-bg-elev">
        <div className="border-b border-border px-4 py-3.5">
          <div className="grid gap-3 xl:flex xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-[7px]">
              <Bar className="h-8.5 w-full max-w-[240px] flex-1" />
              {selectKeys.map((key) => (
                <Bar className="h-8.5 w-[118px]" key={key} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <Bar className="h-3 w-[72px]" />
              <Bar className="h-8.5 w-[100px]" />
            </div>
          </div>
        </div>
        <div className="min-w-0 overflow-hidden">
          <div className="w-full min-w-0">
            <div className={cn(rowGrid, "border-b border-border bg-bg-sunken px-4 py-3")}>
              {headerKeys.map((key) => (
                <div className="h-2.5 w-16 rounded bg-border" key={key} />
              ))}
            </div>
            {rowKeys.map((key) => (
              <div className={cn(rowGrid, "border-b border-border px-4 py-4")} key={key}>
                <Bar className="h-3 w-[120px]" />
                <div className="flex min-w-0 items-center gap-2.5">
                  <Bar className="h-[26px] w-[26px] shrink-0 rounded-control" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Bar className="h-3 w-[72%]" />
                    <Bar className="h-2.5 w-[52%]" />
                  </div>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Bar className="h-3 w-[64%]" />
                  <Bar className="h-2.5 w-[40%]" />
                </div>
                <Bar className="h-5 w-[64px] rounded-full" />
                <Bar className="h-5 w-[56px] rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <Bar className="h-3 w-[240px]" />
        <Bar className="h-3 w-[170px]" />
      </div>
    </PageContent>
  );
}
