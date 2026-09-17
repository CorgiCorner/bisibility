"use client";

import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { Card } from "@/components/ui/Card";
import { ChartRegion } from "@/components/ui/ChartRegion";
import { cn } from "@/lib/ui/cn";
import { useTranslations } from "next-intl";
import { ChartNoDataOverlay } from "./ChartNoDataOverlay";
import { OverviewChartHeader } from "./OverviewChartHeader";
import type { TrendPoint, TrendTakeaway } from "./types";

export type PositionTrendCardProps = {
  data: TrendPoint[];
  empty?: boolean;
  seriesLabel?: string;
  takeaway?: TrendTakeaway;
  takeawayLoading?: boolean;
};

function positionMax(data: TrendPoint[]) {
  const max = Math.max(20, ...data.map((point) => Math.ceil(point.value)));
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
  seriesLabel,
  takeaway,
  takeawayLoading = false,
}: Readonly<PositionTrendCardProps>) {
  const t = useTranslations("projectDashboard.positionTrend");
  const renderedSeriesLabel = seriesLabel ?? t("defaultSeriesLabel");
  const maxPosition = positionMax(data);
  const yAxisWidth = positionAxisWidth(maxPosition);
  const insufficient = !empty && data.length < 2;
  const renderedTakeaway = empty || insufficient ? null : takeawayCopy(t, takeaway ?? null);
  const renderedTakeawayLoading = !empty && !insufficient && takeawayLoading;
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
        trailing={
          <span
            aria-hidden={empty || insufficient ? true : undefined}
            className={cn(
              "inline-flex flex-none items-center gap-1.5 font-sans tabular-nums text-[11px] text-fg-muted",
              (empty || insufficient) && "invisible",
            )}
          >
            <span className="h-[9px] w-[9px] rounded-control bg-accent" aria-hidden />
            {renderedSeriesLabel}
          </span>
        }
      />
      {empty || insufficient ? (
        <div className="relative mt-3 min-w-0 flex-1">
          <div aria-hidden className="h-[250px]" />
          <ChartNoDataOverlay
            description={insufficient ? t("singlePointDescription") : t("noDataDescription")}
            title={insufficient ? t("singlePointTitle") : t("noDataTitle")}
          />
        </div>
      ) : (
        <ChartRegion
          className="relative mt-3 h-[250px]"
          label={t("chartAriaLabel", {
            hasTakeaway: renderedTakeaway ? "true" : "false",
            takeaway: renderedTakeaway ?? "",
          })}
        >
          <TimeSeriesChart
            height={250}
            dateKeys={dateKeys}
            labels={data.map((point) => point.label ?? t("now"))}
            series={[
              {
                label: renderedSeriesLabel,
                values: data.map((point) => point.value),
                color: "var(--accent)",
                fill: true,
                baseline: maxPosition,
              },
            ]}
            min={1}
            max={maxPosition}
            reversed
            yWidth={yAxisWidth}
            tooltip={false}
            areaOpacity={0.09}
            xTickIndexes={[0, 3, 7, data.length - 1].filter((index) => index < data.length)}
            margin={{ top: 12, right: 16, bottom: 0, left: 16 }}
          />
        </ChartRegion>
      )}
    </Card>
  );
}
