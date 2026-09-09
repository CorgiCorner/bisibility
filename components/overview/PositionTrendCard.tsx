"use client";

import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { Card } from "@/components/ui/Card";
import { ChartRegion } from "@/components/ui/ChartRegion";
import { ChartNoDataOverlay } from "./ChartNoDataOverlay";
import { OverviewChartHeader } from "./OverviewChartHeader";
import type { TrendPoint } from "./types";

export type PositionTrendCardProps = {
  data: TrendPoint[];
  empty?: boolean;
  seriesLabel?: string;
  takeaway?: string | null;
  takeawayLoading?: boolean;
};

const positionTrendDefinition =
  "Daily average position of ranked keywords. Lower is better - #1 is the top.";

function positionMax(data: TrendPoint[]) {
  const max = Math.max(20, ...data.map((point) => Math.ceil(point.value)));
  return max + (max % 5 === 0 ? 0 : 5 - (max % 5));
}

function positionAxisWidth(maxPosition: number) {
  // The longest tick starts with the card copy while still allowing 100+ ranks.
  return Math.max(20, String(maxPosition).length * 7 + 6);
}

export function PositionTrendCard({
  data,
  empty = false,
  seriesLabel = "Project",
  takeaway,
  takeawayLoading = false,
}: Readonly<PositionTrendCardProps>) {
  const maxPosition = positionMax(data);
  const yAxisWidth = positionAxisWidth(maxPosition);
  const insufficient = !empty && data.length < 2;
  const renderedTakeaway = empty || insufficient ? null : takeaway;
  const renderedTakeawayLoading = !empty && !insufficient && takeawayLoading;

  return (
    <Card className="flex h-full min-w-0 flex-col px-5 py-4.5" size="md">
      <OverviewChartHeader
        caption={renderedTakeaway}
        captionLoading={renderedTakeawayLoading}
        definition={positionTrendDefinition}
        title="Position trend"
        trailing={
          <span
            aria-hidden={empty || insufficient ? true : undefined}
            className={`inline-flex flex-none items-center gap-1.5 font-sans tabular-nums text-[11px] text-fg-muted ${
              empty || insufficient ? "invisible" : ""
            }`}
          >
            <span className="h-[9px] w-[9px] rounded-control bg-accent" aria-hidden />
            {seriesLabel}
          </span>
        }
      />
      {empty || insufficient ? (
        <div className="relative mt-3 min-w-0 flex-1">
          <div aria-hidden className="h-[250px]" />
          <ChartNoDataOverlay
            description={insufficient ? "complete one more check to compare positions" : undefined}
            title={insufficient ? "Trend appears after the next check" : undefined}
          />
        </div>
      ) : (
        <ChartRegion
          className="relative mt-3 h-[250px]"
          label={`Position trend chart.${renderedTakeaway ? ` ${renderedTakeaway}` : ""}`}
        >
          <TimeSeriesChart
            height={250}
            labels={data.map((point) => point.label)}
            series={[
              {
                label: seriesLabel,
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
