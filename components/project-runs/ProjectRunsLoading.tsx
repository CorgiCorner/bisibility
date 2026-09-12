import { PageContent } from "@/components/shell/PageContent";
import { Card } from "@/components/ui/Card";
import {
  dataTableHeaderHeight,
  dataTableRowHeight,
} from "@/components/ui/data-table/data-table-density";
import { TableCardHeader } from "@/components/ui/TableCardHeader";
import { tableHeaderClassName } from "@/components/ui/table-header-styles";
import { cn } from "@/lib/ui/cn";

const layouts = {
  runs: {
    columns: [
      "Operation",
      "Type",
      "Scope",
      "Status",
      "Progress",
      "Unit",
      "Submitted",
      "Started",
      "Actions",
    ],
    grid: "min-w-[1496px] grid-cols-[260px_170px_230px_152px_140px_128px_184px_184px_48px]",
    label: "runs",
  },
  schedules: {
    columns: ["Schedule", "Cadence", "Members", "Per run", "Next", "Actions"],
    grid: "min-w-[964px] grid-cols-[minmax(184px,2fr)_minmax(160px,1fr)_minmax(192px,2fr)_116px_140px_140px]",
    label: "schedules",
  },
} as const;
const rowKeys = ["first", "second", "third", "fourth", "fifth"] as const;

function Bar({ className }: Readonly<{ className: string }>) {
  return (
    <span
      className={cn("block rounded-control bg-bg-sunken motion-safe:animate-pulse", className)}
    />
  );
}

export function ProjectRunsLoading({
  active = "runs",
}: Readonly<{ active?: keyof typeof layouts }>) {
  const layout = layouts[active];
  return (
    <PageContent aria-busy="true" aria-label={`Loading ${layout.label}`}>
      <span className="sr-only" role="status">
        Loading {layout.label}
      </span>
      <div aria-hidden className="grid min-w-0 gap-4">
        <div className="flex min-w-0 gap-0.5 border-b border-border">
          {(["runs", "schedules"] as const).map((tab) => (
            <span
              key={tab}
              className={cn(
                "-mb-px border-b-2 px-4 py-2.5 text-[13px] font-semibold",
                tab === active ? "border-accent text-fg" : "border-transparent text-fg-muted",
              )}
            >
              {tab === "runs" ? "Runs" : "Schedules"}
            </span>
          ))}
        </div>
        <Card className="min-w-0 overflow-hidden p-0" size="sm">
          <TableCardHeader
            className="border-b border-border"
            title={<Bar className="h-4 w-20" />}
            titleId={`${active}-loading-title`}
            actions={
              <>
                <Bar className="h-8 w-32" />
                <Bar className="h-8 w-28" />
              </>
            }
          />
          <div className="min-w-0 overflow-x-auto">
            <div
              className={cn(tableHeaderClassName, "grid items-center border-t-0", layout.grid)}
              style={{ height: dataTableHeaderHeight }}
              data-loading-table-header
            >
              {layout.columns.map((column) => (
                <span key={column} className="px-3">
                  {column === "Actions" ? null : column}
                </span>
              ))}
            </div>
            {rowKeys.map((row) => (
              <div
                key={row}
                className={cn(
                  "grid items-center border-b border-border-soft last:border-b-0",
                  layout.grid,
                )}
                style={{ height: dataTableRowHeight("standard") }}
                data-loading-table-row
              >
                {layout.columns.map((column) => (
                  <div key={column} className="min-w-0 px-3">
                    <Bar className={column === "Actions" ? "h-4 w-4" : "h-3 w-3/4"} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PageContent>
  );
}
