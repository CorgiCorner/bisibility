"use client";

// A route-level loading.tsx renders this skeleton inside ProjectRunsFeatureBoundary, whose
// messages are a client provider. Reading them from a Server Component would fall back to
// the request config, which does not carry `projectRuns`.

import { PageContent } from "@/components/shell/PageContent";
import { Card } from "@/components/ui/Card";
import {
  dataTableHeaderHeight,
  dataTableRowHeight,
} from "@/components/ui/data-table/data-table-density";
import { TableCardHeader } from "@/components/ui/TableCardHeader";
import { tableHeaderClassName } from "@/components/ui/table-header-styles";
import { cn } from "@/lib/ui/cn";
import { useTranslations } from "next-intl";

const layouts = {
  runs: {
    columns: ["Task", "When", "Status", "Actions"],
    grid: "grid-cols-[minmax(0,1fr)_48px] xl:grid-cols-[minmax(240px,1fr)_224px_240px_180px]",
  },
  schedules: {
    columns: ["Schedule", "Cadence", "Members", "Per run", "Next", "Actions"],
    grid: "min-w-[964px] grid-cols-[minmax(184px,2fr)_minmax(160px,1fr)_minmax(192px,2fr)_116px_140px_140px]",
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

export function ProjectRunsLoadingTabs({ active }: Readonly<{ active: "runs" | "schedules" }>) {
  const t = useTranslations("projectRuns.schedules.loading");
  return (
    <div className="flex min-w-0 gap-0.5 border-b border-border">
      {(["runs", "schedules"] as const).map((tab) => (
        <span
          key={tab}
          className={cn(
            "-mb-px border-b-2 px-4 py-2.5 text-[13px] font-semibold",
            tab === active ? "border-accent text-fg" : "border-transparent text-fg-muted",
          )}
        >
          {tab === "runs" ? t("runs") : t("schedules")}
        </span>
      ))}
    </div>
  );
}

export function ProjectRunsLoading({
  active = "runs",
}: Readonly<{ active?: keyof typeof layouts }>) {
  const t = useTranslations("projectRuns.schedules.loading");
  const tableT = useTranslations("projectRuns.table");
  const timelineT = useTranslations("projectRuns.timeline");
  const layout = layouts[active];
  const label = active === "runs" ? t("loadingRuns") : t("loadingSchedules");
  return (
    <PageContent aria-busy="true" aria-label={label}>
      <span className="sr-only" role="status">
        {label}
      </span>
      <div aria-hidden className="grid min-w-0 gap-4">
        <ProjectRunsLoadingTabs active={active} />
        <Card className="min-w-0 overflow-hidden p-0" size="sm">
          <TableCardHeader
            title={<Bar className="h-4 w-20" />}
            titleId={`${active}-loading-title`}
            actions={
              <>
                <Bar className="h-8 w-32" />
                <Bar className="h-8 w-28" />
              </>
            }
          />
          {active === "runs" ? (
            <div className="flex flex-wrap gap-2 px-3 pb-3">
              <Bar className="h-8 w-16" />
              <Bar className="h-8 w-24" />
              <Bar className="h-8 w-28" />
              <Bar className="h-8 w-20" />
              <Bar className="h-8 w-28" />
            </div>
          ) : null}
          <div className="min-w-0 overflow-x-auto">
            <div
              className={cn(tableHeaderClassName, "grid items-center", layout.grid)}
              style={{ height: dataTableHeaderHeight }}
              data-loading-table-header
            >
              {layout.columns.map((column) => (
                <span
                  key={column}
                  className={cn(
                    "px-3",
                    active === "runs" && ["When", "Status"].includes(column) && "hidden xl:block",
                  )}
                >
                  {column === "Actions"
                    ? null
                    : column === "Task"
                      ? tableT("operation")
                      : column === "When"
                        ? timelineT("when")
                        : column === "Status"
                          ? tableT("status")
                          : column}
                </span>
              ))}
            </div>
            {rowKeys.map((row) => (
              <div
                key={row}
                className={cn(
                  "grid items-center border-b border-border-soft last:border-b-0",
                  active === "runs" && "xl:!min-h-[68px]",
                  layout.grid,
                )}
                style={{ minHeight: active === "runs" ? 112 : dataTableRowHeight("standard") }}
                data-loading-table-row
              >
                {layout.columns.map((column) => (
                  <div
                    key={column}
                    className={cn(
                      "min-w-0 px-3",
                      active === "runs" && ["When", "Status"].includes(column) && "hidden xl:block",
                    )}
                  >
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
