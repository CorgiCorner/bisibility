// Skeleton for /app/competitors with toolbar, market selector, SOV bars, and table.

import { PageContent } from "@/components/shell/PageContent";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-[10px] bg-bg-sunken", className)} />;
}

const sovRows = [
  { key: "s1", width: "92%" },
  { key: "s2", width: "74%" },
  { key: "s3", width: "58%" },
  { key: "s4", width: "41%" },
  { key: "s5", width: "27%" },
] as const;
const headKeys = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
const rowKeys = ["r1", "r2", "r3", "r4", "r5", "r6"] as const;
const tableGrid =
  "grid grid-cols-[minmax(120px,2fr)_repeat(4,minmax(72px,1fr))_64px] items-center gap-x-2.5";

export default function CompetitorsLoading() {
  return (
    <PageContent aria-hidden className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Bar className="h-3.5 w-full max-w-[420px]" />
        <div className="flex gap-2">
          <Bar className="h-9 w-[86px] rounded-lg" />
          <Bar className="h-9 w-[134px] rounded-lg" />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-[18px]">
        <div className="rounded-[14px] border border-border bg-bg-elev px-5 py-[18px]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 flex-col gap-2">
              <Bar className="h-4 w-[150px]" />
              <Bar className="h-3 w-[260px]" />
            </div>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2 rounded-[11px] border border-border bg-bg-sunken px-3 py-2.5">
            <Bar className="h-8 w-[128px]" />
            <Bar className="h-8 w-[96px]" />
            <Bar className="h-8 w-[84px]" />
            <Bar className="ml-auto h-3 w-full max-w-[280px] self-center" />
          </div>
          <div className="mt-[18px] flex flex-col gap-[13px]">
            {sovRows.map((row) => (
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap"
                key={row.key}
              >
                <Bar className="h-[30px] w-[30px] shrink-0 rounded-lg" />
                <Bar className="h-3.5 min-w-0 flex-1 sm:w-[150px] sm:flex-none" />
                <span className="h-2.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-bg-sunken">
                  <span
                    className="block h-full animate-pulse rounded-full bg-border"
                    style={{ width: row.width }}
                  />
                </span>
                <Bar className="h-3 w-full sm:w-[110px] sm:shrink-0" />
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-border-soft pt-3.5">
            <Bar className="h-3 w-full max-w-[420px]" />
          </div>
        </div>

        <div className="overflow-hidden rounded-[14px] border border-border bg-bg-elev">
          <div className="flex items-center justify-between gap-3 border-b border-border px-[18px] py-[15px]">
            <Bar className="h-3.5 w-[210px]" />
            <Bar className="h-8 w-[88px]" />
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div
                className={cn(tableGrid, "border-b border-border bg-bg-sunken px-[18px] py-2.5")}
              >
                {headKeys.map((key) => (
                  <div className="h-2.5 w-12 rounded bg-border" key={key} />
                ))}
              </div>
              {rowKeys.map((key) => (
                <div
                  className={cn(tableGrid, "border-b border-border-soft px-[18px] py-2.5")}
                  key={key}
                >
                  <Bar className="h-3.5 w-[70%]" />
                  <Bar className="h-3.5 w-9" />
                  <Bar className="h-3.5 w-9" />
                  <Bar className="h-3.5 w-9" />
                  <Bar className="h-3.5 w-9" />
                  <Bar className="h-3.5 w-8 justify-self-end" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageContent>
  );
}
