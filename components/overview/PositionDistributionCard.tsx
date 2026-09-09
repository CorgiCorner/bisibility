"use client";

import { Card } from "@/components/ui/Card";
import { ChartRegion } from "@/components/ui/ChartRegion";
import { rankBucketCssVars } from "@/lib/theme/chart-colors";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/dist/csr/ChartBar";
import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  useXAxisScale,
  useYAxisScale,
  XAxis,
  YAxis,
} from "recharts";
import { ChartNoDataOverlay } from "./ChartNoDataOverlay";
import { OverviewChartHeader } from "./OverviewChartHeader";
import type { DistributionBucket } from "./types";

export type PositionDistributionCardProps = {
  buckets: DistributionBucket[];
  empty?: boolean;
};

const axisTextStyle = {
  fill: "var(--fg-muted)",
  fontFamily: "var(--font-sans), system-ui, sans-serif",
  style: { fontVariantNumeric: "tabular-nums" },
  fontSize: 10,
};

const countFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});
const positionDistributionDefinition =
  "Ranked keywords grouped by current position. Keywords outside the top 100 are not shown.";

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

function bucketMax(buckets: DistributionBucket[]) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return Math.ceil(max * 1.2);
}

function DistributionLabels({ buckets }: { buckets: DistributionBucket[] }) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!xScale || !yScale) return null;
  return (
    <g data-chart-counts aria-hidden>
      {buckets.map((bucket) => {
        const x = xScale(bucket.label);
        const y = yScale(bucket.count);
        return x === undefined || y === undefined ? null : (
          <text
            key={bucket.label}
            x={x}
            y={y - 8}
            textAnchor="middle"
            fill="var(--fg-muted)"
            fontSize={11}
          >
            {countFormatter.format(bucket.count)}
          </text>
        );
      })}
    </g>
  );
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
      className="absolute bottom-7 left-2 right-2 top-5.5 grid"
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
              <span className="pointer-events-none absolute left-1/2 top-0 z-10 flex -translate-x-1/2 flex-col items-center gap-px whitespace-nowrap rounded-control bg-code-bg px-[9px] py-1.5 text-code-fg">
                <span className="font-sans tabular-nums text-[11px] font-semibold">
                  {keywordCountLabel(bucket.count)}
                </span>
                <span className="font-sans tabular-nums text-[9.5px] text-code-faint">
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
}: Readonly<PositionDistributionCardProps>) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const max = bucketMax(buckets);
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  return (
    <Card
      className="flex h-full min-w-0 flex-col px-5 py-4.5"
      size="md"
      style={{ containerType: "inline-size" }}
    >
      <OverviewChartHeader
        definition={positionDistributionDefinition}
        title="Position distribution"
      />
      {empty ? (
        <div className="relative mt-3 min-w-0 flex-1 pt-1.5">
          <div aria-hidden className="h-[244px]" />
          <ChartNoDataOverlay icon={ChartBar} />
        </div>
      ) : (
        <div className="relative mt-3 min-w-0 pt-1.5">
          <ChartRegion
            className="relative h-[244px]"
            label={`Position distribution chart. ${buckets
              .map((bucket) => `${bucketRangeLabel(bucket.label)}: ${bucket.count} keywords`)
              .join("; ")}`}
          >
            <ResponsiveContainer
              width="100%"
              height={244}
              initialDimension={{ width: 600, height: 244 }}
              minWidth={0}
            >
              <BarChart
                data={buckets}
                margin={{ top: 22, right: 8, bottom: 0, left: 8 }}
                barCategoryGap="25%"
                accessibilityLayer={false}
              >
                <XAxis
                  dataKey="label"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  tick={axisTextStyle}
                  height={28}
                  interval={0}
                />
                <YAxis domain={[0, max]} hide />
                <Bar dataKey="count" radius={5} isAnimationActive={false}>
                  {buckets.map((bucket, index) => (
                    <Cell
                      key={bucket.label}
                      fill={bucketFill(index)}
                      style={{
                        filter: hoveredIndex === index ? "brightness(1.15) saturate(1.12)" : "none",
                        transition: "filter 140ms ease",
                      }}
                    />
                  ))}
                </Bar>
                <DistributionLabels buckets={buckets} />
              </BarChart>
            </ResponsiveContainer>
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
