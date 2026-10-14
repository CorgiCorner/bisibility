"use client";

import { type TimeSeries, TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { DegradedPositionMarkers } from "@/components/keywords/DegradedPositionMarkers";
import {
  LatestPositionAnnotation,
  TargetReferenceLine,
} from "@/components/keywords/PositionHistoryAnnotations";
import { marketPositionPalette } from "@/components/keywords/PositionHistoryMarketLegend";
import { positionHistoryChartLayout } from "@/components/keywords/position-history-layout";
import type { positionHistorySeries } from "@/components/keywords/position-history-series";
import { ChartRegion } from "@/components/ui/ChartRegion";
import type { marketComparisonData } from "@/lib/keywords/market-position-history";
import type { KeywordRow } from "@/lib/queries/keywords";
import { chartColors } from "@/lib/theme/chart-colors";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

type Props = {
  allMarkets: boolean;
  chartLabels: string[];
  chartRegionLabel: string;
  chartSeries: TimeSeries[];
  comparison: ReturnType<typeof marketComparisonData>;
  displayedPosition: number | null;
  emptyStateTitle: string;
  history: Parameters<typeof positionHistorySeries>[0]["history"];
  keyword: KeywordRow;
  labels: string[];
  maxPosition: number;
  nextCheckLabel: ReactNode;
  notEnough: boolean;
  positions: (number | null)[];
  target: number | null;
};

/** Existing ordinal-series renderer retained only for the compatibility branch. */
export function LegacyPositionHistoryPlot({
  allMarkets,
  chartLabels,
  chartRegionLabel,
  chartSeries,
  comparison,
  displayedPosition,
  emptyStateTitle,
  history,
  keyword,
  labels,
  maxPosition,
  nextCheckLabel,
  notEnough,
  positions,
  target,
}: Readonly<Props>) {
  const t = useTranslations("projectRankTracker.keywordDetail.position");
  return (
    <ChartRegion className="relative mt-2 h-[280px]" label={chartRegionLabel}>
      {notEnough ? (
        <div className="grid h-full place-items-center rounded-card">
          <div className="flex flex-col items-center gap-2 rounded-card border border-border bg-bg-elev px-5 py-4 text-center">
            <p className="m-0 text-[13px] font-semibold text-fg">{emptyStateTitle}</p>
            {displayedPosition !== null ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-bg-sunken px-3 py-1 font-sans tabular-nums text-[11px] text-fg-muted">
                {t("currentPosition", { position: displayedPosition })} | {t("nextCheckLabel")}{" "}
                {nextCheckLabel}
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <TimeSeriesChart
          height={280}
          labels={chartLabels}
          series={chartSeries}
          min={1}
          max={maxPosition}
          reversed
          yTicks={[1, 10, 20]}
          formatValue={(value) => t("axisPosition", { position: value })}
          {...positionHistoryChartLayout}
        >
          {!allMarkets && target !== null ? <TargetReferenceLine target={target} /> : null}
          {!allMarkets && target !== null ? (
            <LatestPositionAnnotation labels={labels} positions={positions} target={target} />
          ) : null}
          {allMarkets ? (
            comparison.values.map((series, index) => (
              <DegradedPositionMarkers
                labels={chartLabels}
                color={
                  marketPositionPalette[index % marketPositionPalette.length] ?? chartColors.accent
                }
                key={series.target.id}
                location={series.target.location}
                points={series.points}
              />
            ))
          ) : (
            <DegradedPositionMarkers
              labels={chartLabels}
              color={chartColors.accent}
              location={keyword.location}
              points={history}
            />
          )}
        </TimeSeriesChart>
      )}
    </ChartRegion>
  );
}
