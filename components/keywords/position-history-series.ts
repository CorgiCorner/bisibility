import type { TimeSeries } from "@/components/charts/TimeSeriesChart";
import { observationSeries, type PositionObservation } from "@/lib/checks/position-observations";
import {
  keywordMarketLabel,
  type marketComparisonData,
} from "@/lib/keywords/market-position-history";
import { chartColors } from "@/lib/theme/chart-colors";
import { marketPositionPalette } from "./PositionHistoryMarketLegend";

export function positionHistorySeries({
  allMarkets,
  comparison,
  history,
  maxPosition,
  label,
}: {
  allMarkets: boolean;
  comparison: ReturnType<typeof marketComparisonData>["values"];
  history: readonly PositionObservation[];
  maxPosition: number;
  label: string;
}): TimeSeries[] {
  return allMarkets
    ? comparison.flatMap((series, index) =>
        series.segments.map((values) => ({
          color: marketPositionPalette[index % marketPositionPalette.length],
          curve: "linear",
          values,
          label: keywordMarketLabel(series.target),
          dots: true,
        })),
      )
    : observationSeries(history).map((values) => ({
        fill: true,
        baseline: maxPosition,
        color: chartColors.accent,
        curve: "linear",
        values,
        label,
        dots: true,
      }));
}
