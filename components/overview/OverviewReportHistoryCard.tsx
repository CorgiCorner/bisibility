"use client";

import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { LocalizedMeasurementHelp } from "@/components/measurement-help/LocalizedMeasurementHelp";
import { Card } from "@/components/ui/Card";
import { ChartRegion } from "@/components/ui/ChartRegion";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { observationSeries } from "@/lib/checks/position-observations";
import type {
  OverviewHistoryDay,
  OverviewReportHistory,
} from "@/lib/queries/overview-report-history";
import { useFormatter, useTranslations } from "next-intl";
import { OverviewChartHeader } from "./OverviewChartHeader";

export function OverviewReportHistoryCard({
  history,
  quality = false,
}: {
  history: OverviewReportHistory;
  quality?: boolean;
}) {
  const t = useTranslations("projectDashboard.reportWidgets");
  const format = useFormatter();
  const number = (value: number | null) =>
    value === null ? t("unknown") : format.number(value, { maximumFractionDigits: 2 });
  const title = t(quality ? "qualityHistory" : "visibilityHistory");
  const versions = [
    ...new Map(
      history.days.map((day) => [`${day.report.metricId}/${day.report.definitionVersion}`, day]),
    ).values(),
  ];
  const latestDay = history.days.at(-1);
  const columns: DataTableColumn<OverviewHistoryDay>[] = [
    {
      id: "date",
      header: t("date"),
      accessorFn: (day) => day.id,
      meta: { lockVisible: true, sortable: false },
    },
    {
      id: "value",
      header: t("visibility"),
      cell: ({ row }) => number(row.original.report.value),
      meta: { align: "end", sortable: false },
    },
    {
      id: "measured",
      header: t("measured"),
      cell: ({ row }) =>
        `${row.original.report.counts.metricEligible}/${row.original.report.counts.expected}`,
      meta: { align: "end", sortable: false },
    },
    {
      id: "coverage",
      header: t("observedCoverage"),
      cell: ({ row }) =>
        number(
          row.original.report.observedCoverage === null
            ? null
            : 100 * row.original.report.observedCoverage,
        ),
      meta: { align: "end", sortable: false },
    },
    {
      id: "fresh",
      header: t("freshCoverage"),
      cell: ({ row }) =>
        number(
          row.original.report.dataCoverage === null ? null : 100 * row.original.report.dataCoverage,
        ),
      meta: { align: "end", sortable: false },
    },
    {
      id: "ranked",
      header: t("ranked"),
      cell: ({ row }) => format.number(row.original.report.counts.ranked),
      meta: { align: "end", sortable: false },
    },
  ];
  return (
    <Card component="section" aria-label={title} className="min-w-0 overflow-hidden p-0" size="md">
      <div className="px-5 pb-3.5 pt-4.5">
        <OverviewChartHeader
          title={title}
          definition={t("historyScope", { asOf: history.asOf })}
          trailing={
            quality ? (
              <div>
                {latestDay ? (
                  <span className="block text-xs text-fg-muted">{latestDay.id}</span>
                ) : null}
                <LocalizedMeasurementHelp
                  metricId="data_quality"
                  definitionVersion="help-v1"
                  report={latestDay?.report}
                />
              </div>
            ) : (
              <div className="flex flex-wrap justify-end gap-1">
                {versions.map((day) => (
                  <div key={`${day.report.metricId}/${day.report.definitionVersion}`}>
                    <span className="block text-xs text-fg-muted">{day.id}</span>
                    <LocalizedMeasurementHelp
                      metricId={day.report.metricId}
                      definitionVersion={day.report.definitionVersion}
                      report={day.report}
                    />
                  </div>
                ))}
              </div>
            )
          }
        />
        <p className="text-xs text-fg-muted">{t("historyFreshness")}</p>
        {history.undatedChecks ? (
          <p className="text-xs text-fg-muted">
            {t("undatedChecks", { count: history.undatedChecks })}
          </p>
        ) : null}
        {history.reason ? (
          <p role="status">{t("timeZoneUnavailable")}</p>
        ) : (
          <p className="text-xs text-fg-muted">{history.timeZone}</p>
        )}
        {!quality && history.days.some((day) => day.report.value !== null) ? (
          <ChartRegion className="mt-3 h-[250px]" label={title}>
            <TimeSeriesChart
              height={250}
              min={0}
              max={100}
              dateKeys={history.days.map((day) => day.id)}
              labels={history.days.map((day) => day.id)}
              series={observationSeries(
                history.days.map((day) => ({
                  comparisonKey: day.comparisonKey,
                  position: day.report.value,
                })),
              ).map((values) => ({
                label: t("visibility"),
                color: "var(--accent)",
                values,
                dots: true,
              }))}
            />
          </ChartRegion>
        ) : null}
      </div>
      <DataTable
        ariaLabel={title}
        bordered={false}
        columns={columns}
        density="compact"
        id={quality ? "overview-quality-history" : "overview-visibility-history"}
        rows={history.days}
        sorting={null}
        sortingMode="client"
        onSortingChange={() => undefined}
      />
    </Card>
  );
}
