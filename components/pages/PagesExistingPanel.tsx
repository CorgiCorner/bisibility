"use client";

import { ChartMarkerLegend } from "@/components/charts/ChartMarkerLegend";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { ConversionSourceSwitch } from "@/components/conversions/ConversionSourceSwitch";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { StatTile } from "@/components/ui/StatTile";
import type {
  ActivePageSnapshot,
  ExistingVsNewView,
  SnapshotMetricId,
  SnapshotMetricOption,
  SnapshotTagMetricRow,
  TakePageSnapshotResult,
} from "@/lib/pages/snapshot-view";
import type { ProjectPageTagOption } from "@/lib/pages/tag-view";
import type { ProjectPagesQuery } from "@/lib/pages/url-state";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo } from "react";
import { PagesSnapshotBaseline } from "./PagesSnapshotBaseline";
import { ProjectPagesSnapshotButton } from "./ProjectPagesSnapshotButton";

const ALL_TAGS = "all";

type TagMetricTableRow = SnapshotTagMetricRow & { id: string };

function sourceName(
  option: SnapshotMetricOption,
  t: ReturnType<typeof useTranslations<"projectPages">>,
) {
  if (option.id === "clicks") return t("sourceKind.search_console");
  if (option.id === "ai_cites") return t("sourceKind.ai_visibility");
  if (option.provider === "plausible") return t("providers.plausible");
  if (option.provider === "ga4") return t("providers.ga4");
  return t("sourceKind.analytics");
}

function metricName(id: SnapshotMetricId, t: ReturnType<typeof useTranslations<"projectPages">>) {
  if (id === "clicks") return t("existing.metric.clicks");
  if (id === "sessions") return t("existing.metric.sessions");
  if (id === "conversions") return t("existing.metric.conversions");
  return t("existing.metric.ai_cites");
}

export function PagesExistingPanel({
  canWrite,
  comparison,
  onQuery,
  onTaken,
  projectId,
  query,
  snapshot,
  tags,
  take,
}: Readonly<{
  canWrite: boolean;
  comparison: ExistingVsNewView | null;
  onQuery: (query: ProjectPagesQuery) => void;
  onTaken: (snapshot: ActivePageSnapshot) => void;
  projectId: string;
  query: ProjectPagesQuery;
  snapshot: ActivePageSnapshot | null;
  tags: readonly ProjectPageTagOption[];
  take: (input: { confirm?: boolean; projectId: string }) => Promise<TakePageSnapshotResult>;
}>) {
  const t = useTranslations("projectPages");
  const format = useFormatter();
  const selected = comparison?.selected ?? null;
  const metric = selected ? metricName(selected, t) : t("existing.metric.clicks");
  const rows = useMemo<TagMetricTableRow[]>(
    () => (comparison?.tags ?? []).map((row) => ({ ...row, id: row.tagId })),
    [comparison?.tags],
  );
  const columns = useMemo<readonly DataTableColumn<TagMetricTableRow>[]>(
    () => [
      {
        cell: ({ row }) => row.original.name,
        header: t("existing.columns.tag"),
        id: "tag",
        meta: { flex: 1, title: t("existing.columns.tag") },
        minSize: 140,
        size: 180,
      },
      {
        cell: ({ row }) => format.number(row.original.existingPages),
        header: t("existing.columns.existing"),
        id: "existing",
        meta: { align: "end", title: t("existing.columns.existing") },
        size: 110,
      },
      {
        cell: ({ row }) => format.number(row.original.freshPages),
        header: t("existing.columns.fresh"),
        id: "fresh",
        meta: { align: "end", title: t("existing.columns.fresh") },
        size: 96,
      },
      {
        cell: ({ row }) => format.number(row.original.existingValue),
        header: t("existing.columns.existingMetric", { metric }),
        id: "existingValue",
        meta: { align: "end", title: t("existing.columns.existingMetric", { metric }) },
        size: 140,
      },
      {
        cell: ({ row }) => format.number(row.original.freshValue),
        header: t("existing.columns.freshMetric", { metric }),
        id: "freshValue",
        meta: { align: "end", title: t("existing.columns.freshMetric", { metric }) },
        size: 130,
      },
      {
        cell: ({ row }) => t("existing.share", { share: row.original.share }),
        header: t("existing.columns.share"),
        id: "share",
        meta: { align: "end", title: t("existing.columns.share") },
        size: 140,
      },
    ],
    [format, metric, t],
  );

  if (!snapshot) {
    return (
      <Card>
        <div className="flex max-w-xl flex-col items-start gap-2">
          <h2 className="m-0 font-semibold text-fg">{t("existing.emptyTitle")}</h2>
          <p className="m-0 text-ui-caption text-fg-muted">{t("existing.emptyBody")}</p>
          <ProjectPagesSnapshotButton
            canWrite={canWrite}
            onTaken={onTaken}
            projectId={projectId}
            snapshot={null}
            take={take}
          />
        </div>
      </Card>
    );
  }

  const view = comparison;
  const points = view?.points ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {(view?.metrics.length ?? 0) > 0 ? (
          <SegmentedControl
            ariaLabel={t("existing.metricLabel")}
            onChange={(metricId) => onQuery({ ...query, metric: metricId })}
            options={(view?.metrics ?? []).map((option) => {
              const source = sourceName(option, t);
              return {
                disabled: option.disabledReason != null,
                label: t("existing.metric.option", { metric: metricName(option.id, t), source }),
                tooltip:
                  option.disabledReason === "no_data"
                    ? t("existing.disabledConversions")
                    : option.disabledReason
                      ? t("existing.disabled", { source })
                      : undefined,
                value: option.id,
              };
            })}
            size="toolbar"
            value={selected ?? "clicks"}
          />
        ) : null}
        {view?.conversionSelection?.showSwitch && view.conversionSelection.selected ? (
          <ConversionSourceSwitch
            onChange={(source) => onQuery({ ...query, conv: source })}
            options={view.conversionSelection.options}
            value={view.conversionSelection.selected}
          />
        ) : null}
        <MenuSelect
          ariaLabel={t("existing.allTags")}
          onChange={(value) => onQuery({ ...query, tag: value === ALL_TAGS ? undefined : value })}
          options={[
            { label: t("existing.allTags"), value: ALL_TAGS },
            ...tags.map((tag) => ({ label: tag.name, value: tag.id })),
          ]}
          value={query.tag ?? ALL_TAGS}
        />
        <SegmentedControl
          ariaLabel={t("existing.spanLabel")}
          onChange={(span) => onQuery({ ...query, span })}
          options={[
            { label: t("existing.span.since"), value: "since" },
            { label: t("existing.span.28"), value: "28" },
          ]}
          size="toolbar"
          value={query.span}
        />
        <div className="ml-auto">
          <ProjectPagesSnapshotButton {...{ canWrite, onTaken, projectId, snapshot, take }} />
        </div>
      </div>
      <Card>
        <SectionTitle className="m-0">{t("existing.title", { metric })}</SectionTitle>
        <PagesSnapshotBaseline projectId={projectId} snapshot={snapshot} />
        {selected && points.length > 0 ? (
          <>
            <TimeSeriesChart
              dateKeys={points.map((point) => point.day)}
              height={280}
              labels={points.map((point) => point.day)}
              markerProjectRef={projectId}
              markers={view?.markers ?? []}
              series={[
                {
                  color: "var(--accent)",
                  label: t("existing.series.existing"),
                  values: points.map((point) => point.existing),
                },
                {
                  color: "var(--green)",
                  label: t("existing.series.fresh"),
                  values: points.map((point) => point.fresh),
                },
              ]}
            />
            <ChartMarkerLegend
              markers={view?.markers ?? []}
              projectRef={projectId}
              series={
                <div className="flex shrink-0 flex-nowrap gap-3 text-ui-caption text-fg">
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full bg-accent" />
                    {t("existing.series.existing")}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full bg-green" />
                    {t("existing.series.fresh")}
                  </span>
                </div>
              }
            />
          </>
        ) : (
          <p className="m-0 mt-3 text-ui-caption text-fg-muted">{t("existing.noSource")}</p>
        )}
        {view?.sessionsNote === "rolling_28_days" ? (
          <p className="m-0 mt-2 text-ui-caption text-fg-muted">{t("existing.rolling")}</p>
        ) : null}
        {view ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <StatTile
              caption={t("existing.summaryExisting", {
                pages: view.summary.existingPages,
                snapshot: view.summary.snapshotPages,
                total: view.summary.existingValue,
              })}
              density="compact"
              label={t("existing.series.existing")}
              value={format.number(view.summary.existingValue)}
            />
            <StatTile
              caption={t("existing.summaryFresh", {
                pages: view.summary.freshPages,
                total: view.summary.freshValue,
              })}
              density="compact"
              label={t("existing.series.fresh")}
              value={format.number(view.summary.freshValue)}
            />
            <StatTile
              caption={t("existing.summaryRemoved", {
                pages: view.summary.removedPages,
                total: view.summary.removedValue,
              })}
              density="compact"
              label={t("existing.series.removed")}
              value={format.number(view.summary.removedValue)}
            />
          </div>
        ) : null}
      </Card>
      <DataTable
        ariaLabel={t("existing.tableLabel")}
        columns={columns}
        density="compact"
        emptyState={<p className="m-0 text-ui-caption text-fg-muted">{t("byTag.empty")}</p>}
        id="project-pages-existing-vs-new"
        onSortingChange={() => undefined}
        rows={rows}
        sorting={null}
        sortingMode="client"
      />
    </div>
  );
}
