"use client";

import { ChartMarkerLegend } from "@/components/charts/ChartMarkerLegend";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { Card } from "@/components/ui/Card";
import { ChartRegion } from "@/components/ui/ChartRegion";
import type { ChartMarker } from "@/lib/annotations/marker-style";
import { observationSeries } from "@/lib/checks/position-observations";
import { useTranslations } from "next-intl";
import { ChartNoDataOverlay } from "./ChartNoDataOverlay";
import { OverviewChartHeader } from "./OverviewChartHeader";
import { PositionTrendTooltip } from "./PositionTrendTooltip";
import type { TrendPoint, TrendTakeaway } from "./types";

export type PositionTrendCardProps = {
  data: TrendPoint[];
  empty?: boolean;
  markers?: readonly ChartMarker[];
  projectRef?: string;
  seriesLabel?: string;
  takeaway?: TrendTakeaway;
  takeawayLoading?: boolean;
};

function positionMax(data: TrendPoint[]) {
  const max = Math.max(20, ...data.map((point) => Math.ceil(point.value ?? 0)));
  return max + (max % 5 === 0 ? 0 : 5 - (max % 5));
}

function positionAxisWidth(maxPosition: number) {
  // The longest tick starts with the card copy while still allowing 100+ ranks.
  return Math.max(20, String(maxPosition).length * 7 + 6);
}

function takeawayCopy(
  t: ReturnType<typeof useTranslations<"projectDashboard.positionTrend">>,
  takeaway: TrendTakeaway,
) {
  if (!takeaway) return null;
  if (takeaway.kind === "steady") {
    return takeaway.window === "firstTrackedDays"
      ? t("takeawaySteadyFirst", { days: takeaway.days })
      : t("takeawaySteadyLast", { days: takeaway.days });
  }
  if (takeaway.kind === "improved") {
    return takeaway.window === "firstTrackedDays"
      ? t("takeawayImprovedFirst", { days: takeaway.days, value: takeaway.value ?? 0 })
      : t("takeawayImprovedLast", {
          days: takeaway.days,
          leader: takeaway.leader ?? "",
          value: takeaway.value ?? 0,
        });
  }
  return takeaway.window === "firstTrackedDays"
    ? t("takeawaySlippedFirst", { days: takeaway.days, value: takeaway.value ?? 0 })
    : t("takeawaySlippedLast", {
        days: takeaway.days,
        leader: takeaway.leader ?? "",
        value: takeaway.value ?? 0,
      });
}

export function PositionTrendCard({
  data,
  empty = false,
  markers = [],
  projectRef,
  seriesLabel,
  takeaway,
  takeawayLoading = false,
}: Readonly<PositionTrendCardProps>) {
  const t = useTranslations("projectDashboard.positionTrend");
  const renderedSeriesLabel = seriesLabel ?? t("defaultSeriesLabel");
  const maxPosition = positionMax(data);
  const yAxisWidth = positionAxisWidth(maxPosition);
  const insufficient = !empty && data.every((point) => point.value === null);
  const renderedTakeaway =
    empty || insufficient || data.length < 2 ? null : takeawayCopy(t, takeaway ?? null);
  const renderedTakeawayLoading = !empty && !insufficient && data.length >= 2 && takeawayLoading;
  // The latest point deliberately uses the localized "now" label. Keep its
  // calendar key out of the formatter so TimeSeriesChart falls back per point,
  // while preceding historical days still use the locale-aware date display.
  const dateKeys = data.map((point) => (point.label === null ? "" : (point.dateKey ?? "")));

  return (
    <Card className="flex h-full min-w-0 flex-col px-5 py-4.5" size="md">
      <OverviewChartHeader
        caption={renderedTakeaway}
        captionLoading={renderedTakeawayLoading}
        definition={t("definition")}
        title={t("title")}
      />
      {empty || insufficient ? (
        <div className="relative mt-3 min-w-0 flex-1">
          <div aria-hidden className="h-[250px]" />
          <ChartNoDataOverlay description={t("noDataDescription")} title={t("noDataTitle")} />
        </div>
      ) : (
        <div className="relative mt-3 min-w-0 flex-1">
          <div aria-hidden className="h-[250px]" />
          <ChartRegion
            className="absolute inset-0"
            label={t("chartAriaLabel", {
              hasTakeaway: renderedTakeaway ? "true" : "false",
              takeaway: renderedTakeaway ?? "",
            })}
          >
            <TimeSeriesChart
              fill
              height={250}
              dateKeys={dateKeys}
              labels={data.map((point) => point.label ?? t("now"))}
              series={observationSeries(
                data.map((point) => ({
                  comparisonKey: point.comparisonKey,
                  position: point.value,
                })),
              ).map((values) => ({
                label: renderedSeriesLabel,
                values,
                color: "var(--accent)",
                fill: true,
                baseline: maxPosition,
                dots: true,
              }))}
              min={1}
              max={maxPosition}
              reversed
              yWidth={yAxisWidth}
              markerProjectRef={projectRef}
              markers={markers}
              renderTooltip={(index) => {
                const point = data[index];
                if (!point || point.value === null) return null;
                return <PositionTrendTooltip point={point} />;
              }}
              areaOpacity={0.09}
              xTickIndexes={[0, 3, 7, data.length - 1].filter((index) => index < data.length)}
              margin={{ top: 12, right: 16, bottom: 0, left: 16 }}
            />
          </ChartRegion>
        </div>
      )}
      {!empty && !insufficient ? (
        <ChartMarkerLegend
          markers={markers}
          projectRef={projectRef}
          series={
            <span className="inline-flex shrink-0 items-center gap-1.5 text-ui-caption text-fg-muted">
              <span className="size-2 rounded-full bg-accent" aria-hidden />
              {renderedSeriesLabel}
            </span>
          }
        />
      ) : null}
    </Card>
  );
}
