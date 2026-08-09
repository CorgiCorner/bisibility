"use client";

import { Card, ChartRegion, InfoTooltip, SectionTitle } from "@/components/ui";
import { chartColors } from "@/lib/theme/chart-colors";
import { LineChart } from "@mui/x-charts/LineChart";
import { ChartNoDataOverlay } from "./ChartNoDataOverlay";
import type { TrendPoint } from "./types";

export type PositionTrendCardProps = {
  data: TrendPoint[];
  empty?: boolean;
  seriesLabel?: string;
  takeaway?: string | null;
  takeawayLoading?: boolean;
};

const axisTextStyle = {
  fill: "var(--fg-muted)",
  fontFamily: "var(--font-mono), monospace",
  fontSize: 11,
};

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
  const renderedTakeaway = empty ? null : takeaway;

  return (
    <Card className="flex h-full min-w-0 flex-col px-5 py-[18px]" size="md">
      <div className="flex min-h-[26px] items-center justify-between gap-3">
        <div className="flex flex-none items-center gap-1.5">
          <SectionTitle className="flex-none">Position trend</SectionTitle>
          {takeawayLoading ? (
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-bg-sunken"
            />
          ) : renderedTakeaway ? (
            <InfoTooltip text={renderedTakeaway} />
          ) : null}
        </div>
        <span
          aria-hidden={empty || insufficient ? true : undefined}
          className={`inline-flex flex-none items-center gap-1.5 font-mono text-[11px] text-fg-muted ${
            empty || insufficient ? "invisible" : ""
          }`}
        >
          <span className="h-[9px] w-[9px] rounded-sm bg-accent" aria-hidden />
          {seriesLabel}
        </span>
      </div>
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
          <LineChart
            axisHighlight={{ x: "none", y: "none" }}
            disableAxisListener
            disableLineItemHighlight
            grid={{ horizontal: true }}
            height={250}
            hideLegend
            // Reserve only enough inset for the centered first date label while the
            // compact y-axis still shares the card's left gutter.
            margin={{ top: 12, right: 16, bottom: 28, left: 16 }}
            series={[
              {
                area: true,
                baseline: maxPosition,
                color: chartColors.accent,
                curve: "linear",
                data: data.map((point) => point.value),
                label: seriesLabel,
                showMark: false,
              },
            ]}
            skipAnimation
            slotProps={{ tooltip: { trigger: "none" } }}
            sx={{
              "& .MuiAreaElement-root": {
                fill: "var(--accent)",
                fillOpacity: 0.09,
              },
              "& .MuiChartsGrid-line": { stroke: "var(--border)" },
              "& .MuiLineElement-root": {
                stroke: "var(--accent)",
                strokeLinecap: "round",
                strokeLinejoin: "round",
                strokeWidth: 2.8,
              },
              "& .MuiChartsAxis-tickLabel": axisTextStyle,
            }}
            xAxis={[
              {
                data: data.map((point) => point.label),
                disableLine: true,
                disableTicks: true,
                scaleType: "point",
                tickLabelInterval: (_value: unknown, index: number) =>
                  [0, 3, 7, data.length - 1].includes(index),
                tickLabelStyle: axisTextStyle,
              },
            ]}
            yAxis={[
              {
                disableLine: true,
                disableTicks: true,
                domainLimit: "strict",
                max: maxPosition,
                min: 1,
                reverse: true,
                tickLabelStyle: axisTextStyle,
                tickNumber: 5,
                width: yAxisWidth,
              },
            ]}
          />
        </ChartRegion>
      )}
    </Card>
  );
}
