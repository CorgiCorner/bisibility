"use client";

import { Card, ChartRegion, InfoTooltip, SectionTitle } from "@/components/ui";
import { chartColors, rankBucketColors, rankBucketCssVars } from "@/lib/theme/chart-colors";
import { BarChart } from "@mui/x-charts/BarChart";
import { useState } from "react";
import { ChartNoDataOverlay } from "./ChartNoDataOverlay";
import type { DistributionBucket } from "./types";

export type PositionDistributionCardProps = {
  buckets: DistributionBucket[];
  empty?: boolean;
  totalLabel?: string;
};

const axisTextStyle = {
  fill: "var(--fg-muted)",
  fontFamily: "var(--font-mono), monospace",
  fontSize: 10,
};

const countFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

function bucketColor(index: number) {
  return rankBucketColors[index % rankBucketColors.length];
}

function bucketFill(index: number) {
  return rankBucketCssVars[index % rankBucketCssVars.length];
}

function keywordCountLabel(count: number) {
  return `${countFormatter.format(count)} ${count === 1 ? "keyword" : "keywords"}`;
}

function bucketRangeLabel(label: string) {
  const [start, end] = label.match(/\d+/g) ?? [];
  return start && end ? `Positions ${start} to ${end}` : label;
}

function bucketPercentLabel(count: number, total: number) {
  if (total <= 0) {
    return "0% of total";
  }

  return `${percentFormatter.format((count / total) * 100)}% of total`;
}

function defaultTotalLabel(buckets: DistributionBucket[]) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  return `${countFormatter.format(total)} ${total === 1 ? "keyword" : "keywords"} by rank bucket`;
}

function bucketMax(buckets: DistributionBucket[]) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return Math.ceil(max * 1.2);
}

function BarInteractionLayer({
  buckets,
  hoveredIndex,
  onHover,
  total,
}: Readonly<{
  buckets: DistributionBucket[];
  hoveredIndex: number | null;
  onHover: (index: number | null) => void;
  total: number;
}>) {
  return (
    <div
      className="absolute bottom-7 left-2 right-2 top-[22px] grid"
      style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}
    >
      {buckets.map((bucket, index) => {
        const isHovered = hoveredIndex === index;

        return (
          <button
            aria-label={`${bucketRangeLabel(bucket.label)}: ${bucket.count} keywords`}
            className="relative min-w-0 cursor-default border-0 bg-transparent p-0"
            key={bucket.label}
            onBlur={() => onHover(null)}
            onFocus={() => onHover(index)}
            onPointerEnter={() => onHover(index)}
            onPointerLeave={() => onHover(null)}
            type="button"
          >
            {isHovered ? (
              <span className="pointer-events-none absolute left-1/2 top-0 z-10 flex -translate-x-1/2 flex-col items-center gap-px whitespace-nowrap rounded-lg bg-code-bg px-[9px] py-1.5 text-code-fg">
                <span className="font-mono text-[11px] font-semibold">
                  {keywordCountLabel(bucket.count)}
                </span>
                <span className="font-mono text-[9.5px] text-code-faint">
                  {bucket.label} · {bucketPercentLabel(bucket.count, total)}
                </span>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function PositionDistributionCard({
  buckets,
  empty = false,
  totalLabel = defaultTotalLabel(buckets),
}: Readonly<PositionDistributionCardProps>) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const max = bucketMax(buckets);
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const chartValues = buckets.map((bucket) => bucket.count);

  return (
    <Card
      className="flex h-full min-w-0 flex-col px-5 py-[18px]"
      size="md"
      sx={{ containerType: "inline-size" }}
    >
      <div className="flex min-h-[26px] items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <SectionTitle className="flex-none">Position distribution</SectionTitle>
          <InfoTooltip text={totalLabel} />
        </div>
      </div>
      {empty ? (
        <div className="relative mt-3 min-w-0 flex-1 pt-1.5">
          <div aria-hidden className="h-[190px]" />
          <ChartNoDataOverlay />
        </div>
      ) : (
        <div className="relative mt-3 min-w-0 pt-1.5">
          <ChartRegion
            className="relative h-[190px]"
            label={`Position distribution chart. ${buckets
              .map((bucket) => `${bucketRangeLabel(bucket.label)}: ${bucket.count} keywords`)
              .join("; ")}`}
          >
            <BarChart
              axisHighlight={{ x: "none", y: "none" }}
              borderRadius={5}
              disableAxisListener
              height={190}
              hideLegend
              margin={{ top: 22, right: 8, bottom: 28, left: 8 }}
              series={[
                {
                  color: chartColors.accent,
                  data: chartValues,
                  label: "Keywords",
                  barLabel: ({ value }) =>
                    typeof value === "number" ? countFormatter.format(value) : null,
                  barLabelPlacement: "outside",
                },
              ]}
              slotProps={{
                bar: ({ dataIndex }) => ({
                  style: {
                    fill: bucketFill(dataIndex),
                    filter: hoveredIndex === dataIndex ? "brightness(1.15) saturate(1.12)" : "none",
                    transition: "filter 140ms ease",
                  },
                }),
                tooltip: { trigger: "none" },
              }}
              sx={{
                "& .MuiBarElement-root": { rx: 5, ry: 5 },
                "& .MuiBarLabel-root": {
                  fill: "var(--fg-muted)",
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 11,
                  fontWeight: 400,
                  transform: "translateY(-4px)",
                },
                "@container (max-width: 359px)": {
                  "& .MuiBarLabel-root": { fontSize: 10 },
                },
                "& .MuiChartsAxis-tickLabel": axisTextStyle,
              }}
              xAxis={[
                {
                  colorMap: {
                    colors: buckets.map((_bucket, index) => bucketColor(index)),
                    type: "ordinal",
                    values: buckets.map((bucket) => bucket.label),
                  },
                  data: buckets.map((bucket) => bucket.label),
                  disableLine: true,
                  disableTicks: true,
                  scaleType: "band",
                  tickLabelStyle: axisTextStyle,
                },
              ]}
              yAxis={[{ max, min: 0, position: "none" }]}
            />
            <BarInteractionLayer
              buckets={buckets}
              hoveredIndex={hoveredIndex}
              onHover={setHoveredIndex}
              total={total}
            />
          </ChartRegion>
        </div>
      )}
    </Card>
  );
}
