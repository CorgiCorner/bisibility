"use client";

import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { DashboardEmptyBody } from "@/components/dashboard-layout/DashboardEmptyBody";
import { LocalizedMeasurementHelp } from "@/components/measurement-help/LocalizedMeasurementHelp";
import { Card } from "@/components/ui/Card";
import { ChartRegion } from "@/components/ui/ChartRegion";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { dataTableViewportHeight } from "@/components/ui/data-table/data-table-density";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { observationSeries } from "@/lib/checks/position-observations";
import type {
  OverviewHistoryDay,
  OverviewReportHistory,
} from "@/lib/queries/overview-report-history";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

export function OverviewReportHistoryCard({
  history,
  quality = false,
}: {
  history: OverviewReportHistory;
  quality?: boolean;
}) {
  const t = useTranslations("projectDashboard.reportWidgets");
  const format = useFormatter();
  const [view, setView] = useState<"chart" | "table">("chart");
  const hasData = history.days.some((day) =>
    quality ? day.report.counts.measured > 0 : day.report.value !== null,
  );
  const tableHeight = dataTableViewportHeight({
    density: "compact",
    footer: false,
    maxRows: 5,
    rows: history.days.length,
  });
  const dateLabel = (id: string) =>
    format.dateTime(new Date(`${id}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
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
      cell: ({ row }) => (
        <time className="whitespace-nowrap" dateTime={row.original.id}>
          {dateLabel(row.original.id)}
        </time>
      ),
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
    <Card
      component="section"
      aria-label={title}
      className="flex h-full min-h-[24.625rem] min-w-0 flex-col overflow-hidden p-0"
      size="md"
    >
      <div className="px-5 pb-3.5 pt-4.5">
        <div
          className="flex flex-wrap items-start justify-between gap-2"
          data-overview-chart-header
        >
          <SectionTitle>{title}</SectionTitle>
          <div className="flex max-w-full flex-wrap items-center gap-2">
            {(quality ? (latestDay ? [latestDay] : []) : versions).map((day) => (
              <div
                className="flex shrink-0 items-center gap-1"
                key={`${day.report.metricId}/${day.report.definitionVersion}`}
              >
                <time className="whitespace-nowrap text-xs text-fg-muted" dateTime={day.id}>
                  {dateLabel(day.id)}
                </time>
                <LocalizedMeasurementHelp
                  metricId={quality ? "data_quality" : day.report.metricId}
                  definitionVersion={quality ? "help-v1" : day.report.definitionVersion}
                  report={day.report}
                />
              </div>
            ))}
          </div>
        </div>
        <p className="mb-0 mt-2 text-xs leading-5 text-fg-muted">
          {t(quality ? "qualityDescription" : "historyDescription")}
        </p>
        {history.reason ? (
          <p role="status" className="mb-0 mt-2 text-xs text-fg-muted">
            {t("timeZoneUnavailable")}
          </p>
        ) : null}
        {hasData ? (
          <div className="mt-3">
            <SegmentedControl
              ariaLabel={t("historyView")}
              size="xs"
              fitContent
              value={view}
              onChange={setView}
              options={[
                { value: "chart", label: t("chartView") },
                { value: "table", label: t("tableView") },
              ]}
            />
          </div>
        ) : null}
      </div>
      {!hasData ? (
        <DashboardEmptyBody title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : view === "chart" ? (
        <div className="px-4 pb-4">
          <ChartRegion className="h-[290px]" label={title}>
            <TimeSeriesChart
              height={290}
              min={0}
              max={100}
              dateKeys={history.days.map((day) => day.id)}
              labels={history.days.map((day) => dateLabel(day.id))}
              series={observationSeries(
                history.days.map((day) => ({
                  comparisonKey: day.comparisonKey,
                  position: quality
                    ? day.report.observedCoverage === null
                      ? null
                      : day.report.observedCoverage * 100
                    : day.report.value,
                })),
              ).map((values) => ({
                label: t(quality ? "observedCoverage" : "visibility"),
                color: "var(--accent)",
                values,
                dots: true,
              }))}
            />
          </ChartRegion>
        </div>
      ) : (
        <div style={{ height: tableHeight }} className="min-h-0" data-history-table-viewport>
          <DataTable
            ariaLabel={title}
            bordered={false}
            columns={columns}
            density="compact"
            id={quality ? "overview-quality-history" : "overview-visibility-history"}
            layout="fill"
            rows={history.days}
            sorting={null}
            sortingMode="client"
            onSortingChange={() => undefined}
          />
        </div>
      )}
    </Card>
  );
}
