"use client";

import { Button, Card, ChartRegion, SegmentedControl } from "@/components/ui";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import type { HistoricalOverviewRow } from "@/lib/providers/types";
import { chartColors } from "@/lib/theme/chart-colors";
import { LineChart } from "@mui/x-charts/LineChart";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react";
import { useState } from "react";
import { type HistoryMetric, historyLabel, historyMetricValue } from "./domain-overview-metrics";

type Range = "12m" | "3m" | "6m";

const rangeOptions = [
  { label: "3m", value: "3m" },
  { label: "6m", value: "6m" },
  { label: "12m", value: "12m" },
] as const;
const metricOptions = [
  { label: "Est. traffic", value: "traffic" },
  { label: "Keywords", value: "keywords" },
  { label: "Top 10", value: "top10" },
  { label: "Traffic value", value: "value" },
] as const;
const metricLabels: Record<HistoryMetric, string> = {
  keywords: "Keywords",
  top10: "Top 10",
  traffic: "Est. traffic",
  value: "Traffic value",
};
const axisTextStyle = {
  fill: "var(--fg-muted)",
  fontFamily: "var(--font-mono), monospace",
  fontSize: 11,
};

function formatValue(value: number, metric: HistoryMetric) {
  if (metric === "value") {
    return new Intl.NumberFormat("en-US", {
      currency: "USD",
      maximumFractionDigits: 0,
      notation: "compact",
      style: "currency",
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    notation: value >= 1_000 ? "compact" : "standard",
  }).format(value);
}

export function DomainOverviewPerformanceChart({
  estimateCents,
  failed,
  history,
  loading,
  onLoad,
}: Readonly<{
  estimateCents: number | null;
  failed?: boolean;
  history: HistoricalOverviewRow[] | null;
  loading: boolean;
  onLoad: () => void;
}>) {
  const [metric, setMetric] = useState<HistoryMetric>("traffic");
  const [range, setRange] = useState<Range>("12m");
  const months = range === "3m" ? 4 : range === "6m" ? 7 : 13;
  const visible = history?.slice(-months) ?? [];
  const values = visible.map((row) => historyMetricValue(row, metric));
  const labels = visible.map(historyLabel);

  return (
    <Card className="flex min-h-[350px] min-w-0 flex-col px-4 py-4" size="md">
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="mr-auto">
          <h3 className="m-0 text-[14.5px] font-semibold">Organic performance</h3>
          <p className="m-0 mt-0.5 text-[11.5px] text-fg-muted">
            Estimated · monthly index history
          </p>
        </div>
        <SegmentedControl
          ariaLabel="History range"
          fitContent
          onChange={setRange}
          options={rangeOptions}
          size="xs"
          value={range}
        />
      </div>
      <div className="mt-3 flex min-w-0 items-center">
        <SegmentedControl
          ariaLabel="History metric"
          fitContent
          onChange={setMetric}
          options={metricOptions}
          size="xs"
          value={metric}
        />
      </div>
      {visible.length > 1 ? (
        <ChartRegion
          className="mt-2 h-[260px]"
          label={`${metricLabels[metric]} monthly organic performance chart`}
        >
          <LineChart
            axisHighlight={{ x: "line", y: "none" }}
            grid={{ horizontal: true }}
            height={260}
            hideLegend
            margin={{ bottom: 28, left: 0, right: 34, top: 12 }}
            series={[
              {
                area: true,
                baseline: 0,
                color: chartColors.accent,
                curve: "linear",
                data: values,
                label: metricLabels[metric],
                showMark: false,
                valueFormatter: (value) =>
                  typeof value === "number" ? formatValue(value, metric) : "No data",
              },
            ]}
            skipAnimation
            sx={{
              "& .MuiAreaElement-root": { fill: "var(--accent)", fillOpacity: 0.09 },
              "& .MuiChartsGrid-line": { stroke: "var(--border)" },
              "& .MuiLineElement-root": { strokeWidth: 2.5 },
              "& .MuiChartsAxis-tickLabel": axisTextStyle,
              "& .MuiChartsAxis-directionY .MuiChartsAxis-tickLabel": {
                // The axis anchor sits 42px right of the card title; align every label start to it.
                textAnchor: "start",
                transform: "translateX(-42px)",
              },
            }}
            xAxis={[
              {
                data: labels,
                disableLine: true,
                disableTicks: true,
                scaleType: "point",
                tickLabelInterval: (_value: unknown, index: number) =>
                  visible.length <= 7 || index % 2 === 0 || index === visible.length - 1,
                tickLabelStyle: axisTextStyle,
              },
            ]}
            yAxis={[
              {
                disableLine: true,
                disableTicks: true,
                min: 0,
                tickLabelStyle: axisTextStyle,
                tickNumber: 5,
                valueFormatter: (value: number) => formatValue(value, metric),
                width: 48,
              },
            ]}
          />
        </ChartRegion>
      ) : (
        <div className="grid min-h-[260px] flex-1 place-items-center text-center">
          <div className="grid justify-items-center gap-2.5">
            <span className="grid h-11 w-11 place-items-center rounded-[11px] bg-bg-sunken text-fg-muted">
              <ChartLineUp aria-hidden size={22} weight="bold" />
            </span>
            <strong className="text-sm">Load monthly organic history</strong>
            <span className="max-w-[360px] font-mono text-[11px] leading-relaxed text-fg-muted">
              {failed
                ? "History could not be loaded. The overview report is still available."
                : "History is cached for 12 hours. Switching metrics and ranges after loading is free."}
            </span>
            <Button loading={loading} onClick={onLoad} size="sm" variant="secondary">
              Load history
              {estimateCents == null ? null : ` ~${formatEstimateCents(estimateCents)}`}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
