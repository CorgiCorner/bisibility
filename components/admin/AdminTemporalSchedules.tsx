"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn, DataTableSort } from "@/components/ui/data-table/data-table-types";
import type { TemporalScheduleIssue } from "@/lib/ops/heartbeat-temporal";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

type ScheduleRow = TemporalScheduleIssue & { id: string };

const scheduleLabels = {
  "planner-rank-check-runs": "planChecks",
  "alert-delivery-sweep": "deliverAlerts",
  "maintenance-stale-import-jobs": "recoverImports",
  "maintenance-stale-checks": "recoverChecks",
  "maintenance-metering-reservations": "releaseReservations",
  "dispatcher-rank-checks": "dispatchChecks",
  "maintenance-rank-check-runs": "maintainRuns",
  "maintenance-provider-usage-reconciliation": "reconcileUsage",
  "maintenance-alert-digest-flush": "sendDigests",
  "maintenance-search-insights-queued-imports": "collectSearchInsights",
  "maintenance-alert-health": "checkAlertHealth",
  "maintenance-migration-hold-release": "releaseMigrationHolds",
  "rank-check-reconciler": "reconcileChecks",
} as const;

export function AdminTemporalSchedules({
  issues,
  inspectionErrors,
}: Readonly<{
  issues: TemporalScheduleIssue[];
  inspectionErrors: number;
}>) {
  const t = useTranslations("instanceAdmin.dashboard.temporal");
  const format = useFormatter();
  const [sorting, setSorting] = useState<DataTableSort | null>({
    direction: "desc",
    field: "skippedOverlap",
  });
  const rows = useMemo(() => issues.map((issue) => ({ ...issue, id: issue.scheduleId })), [issues]);
  const columns = useMemo<readonly DataTableColumn<ScheduleRow>[]>(
    () => [
      {
        id: "schedule",
        accessorFn: (row) => row.scheduleId,
        header: t("schedule"),
        cell: ({ row }) => {
          const { scheduleId } = row.original;
          const label = Object.hasOwn(scheduleLabels, scheduleId)
            ? scheduleLabels[scheduleId as keyof typeof scheduleLabels]
            : null;
          return (
            <div className="min-w-0 py-1 [overflow-wrap:anywhere]">
              {label ? (
                <span className="block text-[13px] font-medium text-fg">{t(`tasks.${label}`)}</span>
              ) : null}
              <span className="block text-xs leading-5 text-fg-muted">{scheduleId}</span>
            </div>
          );
        },
        meta: { flex: 1, sortable: true, title: t("schedule") },
        minSize: 280,
        size: 360,
      },
      ...(["missedCatchup", "skippedOverlap"] as const).map(
        (key): DataTableColumn<ScheduleRow> => ({
          id: key,
          accessorFn: (row) => row[key],
          header: t(key),
          cell: ({ row }) => (
            <span className="tabular-nums">{format.number(row.original[key])}</span>
          ),
          meta: { align: "end", sortable: true, title: t(key) },
          minSize: 200,
          size: 220,
        }),
      ),
    ],
    [format, t],
  );

  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold text-fg">{t("historyTitle")}</h3>
      <p className="mb-3 mt-1 max-w-4xl text-[13px] leading-5 text-fg-muted">{t("counterNote")}</p>
      {inspectionErrors > 0 ? (
        <p className="mb-3 text-[13px] leading-5 text-yellow-text">
          {t("inspectionPartial", { count: inspectionErrors })}
        </p>
      ) : null}
      {issues.length > 0 ? (
        <DataTable
          ariaLabel={t("tableLabel")}
          bordered={false}
          columns={columns}
          density="compact"
          id="admin-temporal-schedules"
          layout="auto"
          onSortingChange={setSorting}
          rows={rows}
          sorting={sorting}
          sortingMode="client"
        />
      ) : inspectionErrors === 0 ? (
        <p className="text-[13px] text-fg-muted">{t("noCounters")}</p>
      ) : null}
    </div>
  );
}
