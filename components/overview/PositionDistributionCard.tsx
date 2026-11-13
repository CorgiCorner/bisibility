"use client";

import { Card } from "@/components/ui/Card";
import { ChartRegion } from "@/components/ui/ChartRegion";
import { rankBucketCssVars } from "@/lib/theme/chart-colors";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/dist/csr/ChartBar";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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

function bucketFill(index: number) {
  return rankBucketCssVars[index % rankBucketCssVars.length];
}

function bucketRange(label: string) {
  const [start, end] = label.match(/\d+/g) ?? [];
  return start && end ? { end: Number(end), start: Number(start) } : null;
}

function bucketMax(buckets: DistributionBucket[]) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return Math.ceil(max * 1.2);
}

function bandCenter(
  scale: (value: string, options?: { position?: "middle" }) => number | undefined,
  label: string,
) {
  const center = scale(label, { position: "middle" });
  return typeof center === "number" && !Number.isNaN(center) ? center : null;
}

function DistributionLabels({ buckets }: { buckets: DistributionBucket[] }) {
  const format = useFormatter();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!xScale || !yScale) return null;
  return (
    <g data-chart-counts aria-hidden>
      {buckets.map((bucket) => {
        const x = bandCenter(xScale, bucket.label);
        const y = yScale(bucket.count);
        if (x === null || y === undefined) return null;
        const zero = bucket.count === 0;
        return (
          <text
            key={bucket.label}
            x={x}
            y={y - 8}
            textAnchor="middle"
            fill={zero ? "var(--fg-muted)" : "var(--fg)"}
            fontSize={11}
          >
            {format.number(bucket.count)}
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
  const t = useTranslations("projectDashboard.distribution");
  return (
    <div
      className="absolute bottom-7 left-2 right-2 top-5.5 grid"
      style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}
    >
      {buckets.map((bucket, index) => {
        const isHovered = hoveredIndex === index;
        const range = bucketRange(bucket.label);
        const rangeLabel = range ? t("positionRange", range) : bucket.label;

        return (
          <button
            aria-label={
              range
                ? t("bucketAriaLabel", { ...range, count: bucket.count })
                : t("keywordCount", { count: bucket.count })
            }
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
                  {t("keywordShare", {
                    count: bucket.count,
                    percent: total <= 0 ? 0 : (bucket.count / total) * 100,
                  })}
                </span>
                <span className="font-sans tabular-nums text-[9.5px] text-code-faint">
                  {rangeLabel}
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
  const t = useTranslations("projectDashboard.distribution");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const max = bucketMax(buckets);
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const gridTicks = [0, max / 3, (max * 2) / 3, max];

  return (
    <Card
      className="flex h-full min-w-0 flex-col px-5 py-4.5"
      size="md"
      style={{ containerType: "inline-size" }}
    >
      <OverviewChartHeader definition={t("definition")} title={t("title")} />
      {empty ? (
        <div className="relative mt-3 min-w-0 flex-1 pt-1.5">
          <div aria-hidden className="h-[244px]" />
          <ChartNoDataOverlay icon={ChartBar} />
        </div>
      ) : (
        <div
          className="relative mt-3 flex min-w-0 flex-1 flex-col pt-1.5"
          data-distribution-plot=""
        >
          <div className="relative min-h-0 flex-1">
            <div aria-hidden className="h-[244px]" />
            <ChartRegion
              className="absolute inset-0"
              label={t("chartAriaLabel", {
                summary: buckets
                  .map((bucket) => {
                    const range = bucketRange(bucket.label);
                    return t("summaryItem", {
                      count: bucket.count,
                      range: range ? t("positionRange", range) : bucket.label,
                    });
                  })
                  .join("; "),
              })}
            >
              <ResponsiveContainer
                width="100%"
                height="100%"
                initialDimension={{ width: 600, height: 244 }}
                minWidth={0}
              >
                <BarChart
                  data={buckets}
                  margin={{ top: 22, right: 8, bottom: 0, left: 8 }}
                  barCategoryGap="25%"
                  accessibilityLayer={false}
                >
                  <CartesianGrid
                    horizontal
                    vertical={false}
                    stroke="var(--border)"
                    strokeOpacity={0.45}
                  />
                  <XAxis
                    dataKey="label"
                    type="category"
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                    tick={axisTextStyle}
                    height={36}
                    tickMargin={10}
                    interval={0}
                  />
                  <YAxis domain={[0, max]} hide ticks={gridTicks} />
                  <Bar
                    dataKey="count"
                    maxBarSize={48}
                    minPointSize={2}
                    radius={5}
                    isAnimationActive={false}
                  >
                    {buckets.map((bucket, index) => (
                      <Cell
                        key={bucket.label}
                        fill={bucketFill(index)}
                        style={{
                          filter:
                            hoveredIndex === index ? "brightness(1.15) saturate(1.12)" : "none",
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
        </div>
      )}
    </Card>
  );
}
