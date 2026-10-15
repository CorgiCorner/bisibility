import { PageContent } from "@/components/shell/PageContent";
import {
  dataTableHeaderHeight,
  dataTableRowHeight,
} from "@/components/ui/data-table/data-table-density";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className: string }>) {
  return (
    <span
      className={cn(
        "block max-w-full rounded-control bg-bg-sunken motion-safe:animate-pulse",
        className,
      )}
    />
  );
}

const columns =
  "grid min-w-[760px] grid-cols-[minmax(240px,1fr)_100px_112px_80px_160px_56px] items-center";

export function MarketsPageLoading() {
  return (
    <PageContent variant="analytics" aria-busy="true" aria-hidden>
      <div className="grid min-w-0 gap-5" data-markets-loading="">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border">
          <div className="flex min-w-0 gap-0.5">
            <div className="border-b-2 border-accent px-4 py-2.5">
              <Bar className="h-[19.5px] w-28" />
            </div>
            <div className="px-4 py-2.5">
              <Bar className="h-[19.5px] w-16" />
            </div>
          </div>
          <Bar className="h-8 w-24" />
        </div>
        <section className="min-w-0 overflow-hidden rounded-card border border-border bg-bg-elev">
          <div className="flex items-center justify-between px-4 py-3">
            <Bar className="h-[21px] w-28" />
            <Bar className="h-[18px] w-6" />
          </div>
          <div className="overflow-x-auto">
            <div
              className={cn(columns, "border-y border-border bg-table-header-bg")}
              style={{ height: dataTableHeaderHeight }}
            >
              {Array.from({ length: 6 }, (_, index) => (
                <div className="px-3" key={index}>
                  <Bar className="h-3 w-16" />
                </div>
              ))}
            </div>
            {Array.from({ length: 3 }, (_, row) => (
              <div
                className={cn(columns, "border-b border-border-soft last:border-b-0")}
                style={{ height: dataTableRowHeight("standard") }}
                key={row}
              >
                <div className="space-y-1 px-3">
                  <Bar className="h-4 w-36" />
                  <Bar className="h-3 w-40" />
                </div>
                {Array.from({ length: 5 }, (_, column) => (
                  <div className="px-3" key={column}>
                    <Bar className="h-4 w-12" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>
    </PageContent>
  );
}
