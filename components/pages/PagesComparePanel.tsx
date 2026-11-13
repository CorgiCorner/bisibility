"use client";

import { chartMarkerTitle } from "@/components/charts/chart-marker-title";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { StatTile } from "@/components/ui/StatTile";
import { StatusChip } from "@/components/ui/StatusChip";
import type {
  CompareAnnotationOption,
  CompareGroupView,
  CompareMetricId,
  CompareResult,
  CompareView,
} from "@/lib/pages/compare-model";
import { type ProjectPagesQuery, projectPagesHref } from "@/lib/pages/url-state";
import { appPath } from "@/lib/routing/app-path";
import { useFormatter, useTranslations } from "next-intl";
import { PagesCompareChart } from "./PagesCompareChart";

type PagesCopy = ReturnType<typeof useTranslations<"projectPages">>;
type MarkerCopy = ReturnType<typeof useTranslations<"shared.chartMarkers">>;

function metricName(id: CompareMetricId, t: PagesCopy) {
  if (id === "impressions") return t("compare.metric.impressions");
  if (id === "sessions") return t("compare.metric.sessions");
  return t("compare.metric.clicks");
}

function sourceName(id: CompareMetricId, t: PagesCopy) {
  return id === "sessions" ? t("compare.source.analytics") : t("compare.source.search_console");
}

function signed(value: number) {
  if (value > 0) return "positive" as const;
  if (value < 0) return "negative" as const;
  return "other" as const;
}

function groupValue(group: CompareGroupView, metric: CompareMetricId, t: PagesCopy) {
  if (group.lowVolume) {
    return metric === "clicks" ? t("compare.notEnoughClicks") : t("compare.notEnough");
  }
  if (group.percent == null) return t("compare.monitoring");
  return t("compare.percent", { direction: signed(group.percent), percent: group.percent });
}

function differenceValue(result: CompareResult, metric: CompareMetricId, t: PagesCopy) {
  if (result.difference.kind === "monitoring") return t("compare.monitoring");
  if (result.difference.kind === "not_enough") {
    return metric === "clicks" ? t("compare.notEnoughClicks") : t("compare.notEnough");
  }
  return t("compare.points", {
    direction: signed(result.difference.points),
    points: result.difference.points,
  });
}

function annotationLabel(
  option: CompareAnnotationOption,
  format: ReturnType<typeof useFormatter>,
  markers: MarkerCopy,
  t: PagesCopy,
) {
  const date = format.dateTime(new Date(`${option.dateKey}T12:00:00.000Z`), {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  });
  return t("compare.annotationOption", { date, title: chartMarkerTitle(option, markers) });
}

function CompareTile({
  detail,
  label,
  value,
}: Readonly<{ detail?: string; label: string; value: string }>) {
  return <StatTile caption={detail} density="compact" label={label} value={value} />;
}

export function PagesComparePanel({
  compare,
  onQuery,
  projectId,
  query,
}: Readonly<{
  compare: CompareView | null;
  onQuery: (query: ProjectPagesQuery) => void;
  projectId: string;
  query: ProjectPagesQuery;
}>) {
  const t = useTranslations("projectPages");
  const markers = useTranslations("shared.chartMarkers");
  const format = useFormatter();
  if (!compare) return <div className="h-64 rounded-card bg-bg-sunken motion-safe:animate-pulse" />;
  if (compare.empty === "no_tags") {
    return (
      <Card>
        <div className="flex max-w-xl flex-col items-start gap-2">
          <h2 className="m-0 font-semibold text-fg">{t("compare.emptyTags")}</h2>
          <Button
            href={projectPagesHref(projectId, { ...query, page: 1, tab: "by-tag" })}
            variant="secondary"
          >
            {t("compare.emptyTagsAction")}
          </Button>
        </div>
      </Card>
    );
  }
  if (compare.empty === "no_annotations") {
    return (
      <Card>
        <div className="flex max-w-xl flex-col items-start gap-2">
          <h2 className="m-0 font-semibold text-fg">{t("compare.emptyAnnotations")}</h2>
          <Button href={appPath(projectId, "annotations")} variant="secondary">
            {t("compare.emptyAnnotationsAction")}
          </Button>
        </div>
      </Card>
    );
  }

  const metric = compare.selectedMetric ?? "clicks";
  const result = compare.result;
  const waiting = result?.day === 0;
  const title = result
    ? chartMarkerTitle(result.annotation, markers)
    : t("compare.chooseAnnotation");
  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1 text-ui-caption text-fg-muted">
            <span>{t("compare.changed")}</span>
            <MenuSelect
              ariaLabel={t("compare.changed")}
              onChange={(changed) => onQuery({ ...query, changed, page: 1 })}
              options={compare.tags.map((tag) => ({
                label: t("compare.tagOption", { name: tag.name, pages: tag.pages }),
                value: tag.id,
              }))}
              searchable
              value={compare.changedTagId ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1 text-ui-caption text-fg-muted">
            <span>{t("compare.unchanged")}</span>
            <MenuSelect
              ariaLabel={t("compare.unchanged")}
              onChange={(unchanged) => onQuery({ ...query, page: 1, unchanged })}
              options={compare.tags.map((tag) => ({
                label: t("compare.tagOption", { name: tag.name, pages: tag.pages }),
                value: tag.id,
              }))}
              searchable
              value={compare.unchangedTagId ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1 text-ui-caption text-fg-muted">
            <span>{t("compare.annotationLabel")}</span>
            <MenuSelect
              ariaLabel={t("compare.annotationLabel")}
              menuFooter={
                <Button href={appPath(projectId, "annotations")} size="sm" variant="ghost">
                  {t("compare.addNote")}
                </Button>
              }
              onChange={(annotation) => onQuery({ ...query, annotation, page: 1 })}
              options={compare.annotations.map((option) => ({
                label: annotationLabel(option, format, markers, t),
                value: option.id,
              }))}
              searchable
              value={compare.annotationId ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1 text-ui-caption text-fg-muted">
            <span>{t("compare.metricLabel")}</span>
            <MenuSelect
              ariaLabel={t("compare.metricLabel")}
              onChange={(value) =>
                onQuery({ ...query, compareMetric: value as CompareMetricId, page: 1 })
              }
              options={compare.metrics.map((option) => ({
                disabled: option.disabledReason != null,
                label: t("compare.metricOption", {
                  metric: metricName(option.id, t),
                  source: sourceName(option.id, t),
                }),
                tooltip: option.disabledReason
                  ? t("compare.unconnected", { source: sourceName(option.id, t) })
                  : undefined,
                value: option.id,
              }))}
              value={compare.selectedMetric ?? metric}
            />
          </div>
        </div>
      </Card>
      {compare.empty === "overlap" ? (
        <Card>
          <h2 className="m-0 font-semibold text-fg">{t("compare.emptyOverlap")}</h2>
        </Card>
      ) : null}
      {result ? (
        <Card>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 font-semibold text-fg">{title}</h2>
              <StatusChip
                label={
                  waiting
                    ? t("compare.waiting")
                    : result.phase === "finished"
                      ? t("compare.finished")
                      : t("compare.monitoring")
                }
                tone={waiting ? "neutral" : result.phase === "finished" ? "positive" : "attention"}
              />
            </div>
            <p className="m-0 text-ui-caption text-fg-muted">
              {waiting
                ? t("compare.madeToday")
                : t("compare.dayOf", { day: result.day, metric: metricName(metric, t) })}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CompareTile
                detail={
                  waiting
                    ? undefined
                    : t("compare.groupDetail", {
                        count: result.changed.pageCount,
                        metric: metricName(metric, t),
                      })
                }
                label={t("compare.seriesChanged")}
                value={waiting ? t("compare.waiting") : groupValue(result.changed, metric, t)}
              />
              <CompareTile
                detail={
                  waiting
                    ? undefined
                    : t("compare.groupDetail", {
                        count: result.unchanged.pageCount,
                        metric: metricName(metric, t),
                      })
                }
                label={t("compare.seriesUnchanged")}
                value={waiting ? t("compare.waiting") : groupValue(result.unchanged, metric, t)}
              />
              <CompareTile
                label={t("compare.forecastLabel")}
                value={waiting ? t("compare.waiting") : t("compare.forecastUnavailable")}
              />
              <CompareTile
                label={t("compare.differenceLabel")}
                value={waiting ? t("compare.waiting") : differenceValue(result, metric, t)}
              />
            </div>
            {result.overlapPages > 0 ? (
              <p className="m-0 text-ui-caption text-fg-muted">
                {t("compare.overlap", { count: result.overlapPages })}
              </p>
            ) : null}
            {result.points.length > 0 ? (
              <PagesCompareChart projectId={projectId} result={result} />
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
