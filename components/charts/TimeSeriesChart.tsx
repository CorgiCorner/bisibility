"use client";

import type { ReactNode } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TimeSeries = {
  label: string;
  color: string;
  values: readonly (number | null)[];
  fill?: boolean;
  baseline?: number;
  curve?: "linear" | "monotoneX";
  formatValue?: (value: number) => string;
};
export type TimeSeriesChartProps = {
  labels: readonly string[];
  series: readonly TimeSeries[];
  height: number;
  min?: number;
  max?: number;
  reversed?: boolean;
  yTicks?: number[];
  yWidth?: number;
  xTickIndexes?: number[];
  formatValue?: (value: number) => string;
  showGrid?: boolean;
  showYAxis?: boolean;
  tooltip?: boolean;
  strokeWidth?: number;
  areaOpacity?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  children?: ReactNode;
};
const axisStyle = {
  fill: "var(--fg-muted)",
  fontFamily: "var(--font-sans), system-ui, sans-serif",
  fontSize: 11,
  style: { fontVariantNumeric: "tabular-nums" },
};
const defaultMargin = { top: 12, right: 16, bottom: 0, left: 0 };

export function TimeSeriesChart({
  labels,
  series,
  height,
  min = 0,
  max,
  reversed = false,
  yTicks,
  yWidth = 42,
  xTickIndexes,
  formatValue,
  showGrid = true,
  showYAxis = true,
  tooltip = true,
  strokeWidth = 2.8,
  areaOpacity = 0.1,
  margin = defaultMargin,
  children,
}: TimeSeriesChartProps) {
  const data = labels.map((label, index) => ({
    index,
    label,
    ...Object.fromEntries(series.map((item, i) => [`value${i}`, item.values[index] ?? null])),
  }));
  return (
    <ResponsiveContainer
      width="100%"
      height={height}
      minWidth={0}
      initialDimension={{ width: 600, height }}
    >
      <ComposedChart data={data} margin={margin} accessibilityLayer>
        {showGrid ? <CartesianGrid vertical={false} stroke="var(--border)" /> : null}
        <XAxis
          dataKey="index"
          type="category"
          scale="point"
          axisLine={false}
          tickLine={false}
          height={28}
          tick={axisStyle}
          tickFormatter={(index) => labels[Number(index)] ?? ""}
          ticks={xTickIndexes}
          minTickGap={16}
        />
        <YAxis
          domain={[min, max ?? "auto"]}
          allowDataOverflow={max !== undefined}
          reversed={reversed}
          hide={!showYAxis}
          width={showYAxis ? yWidth : 0}
          axisLine={false}
          tickLine={false}
          ticks={yTicks}
          tickCount={5}
          tick={axisStyle}
          tickFormatter={formatValue}
          allowDecimals={false}
        />
        {tooltip ? (
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: "var(--border-control)", strokeDasharray: "3 3" }}
            labelFormatter={(index) => labels[Number(index)] ?? ""}
            contentStyle={{
              background: "var(--bg-elev)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--fg)",
              fontSize: 12,
            }}
            formatter={(value, name, item) => {
              const selected = series[Number(String(item.dataKey).replace("value", ""))];
              return [
                typeof value === "number"
                  ? ((selected?.formatValue ?? formatValue)?.(value) ?? String(value))
                  : "No data",
                name,
              ];
            }}
          />
        ) : null}
        {series.map((item, index) =>
          item.fill ? (
            <Area
              key={item.label}
              name={item.label}
              dataKey={`value${index}`}
              type={item.curve ?? "linear"}
              baseValue={item.baseline ?? min}
              stroke={item.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={item.color}
              fillOpacity={areaOpacity}
              dot={false}
              activeDot={tooltip ? { r: 4 } : false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ) : (
            <Line
              key={item.label}
              name={item.label}
              dataKey={`value${index}`}
              type={item.curve ?? "linear"}
              stroke={item.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={tooltip ? { r: 4 } : false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ),
        )}
        {children}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
