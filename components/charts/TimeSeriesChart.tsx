"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { formatDisplayDate, formatDisplayMonthYear } from "@/lib/dates/format";
import type { CSSProperties, ReactNode } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Text,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TimeSeries = {
  label: string;
  color: string;
  values: readonly (number | null)[];
  fill?: boolean;
  dots?: boolean;
  baseline?: number;
  curve?: "linear" | "monotoneX";
  formatValue?: (value: number) => string;
};
export type TimeSeriesChartProps = {
  /** Exact calendar-day keys for locale-aware axes and tooltips. */
  dateKeys?: readonly string[];
  dateLabelStyle?: "date" | "month_year";
  /** Align endpoint dates to the plot edges and leave room below the baseline. */
  dateAxisLayout?: "compact" | "aligned";
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
  /** Replaces the default tooltip body. The argument is the active point index. */
  renderTooltip?: (index: number) => ReactNode;
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
const tooltipContentStyle = {
  background: "var(--bg-elev)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--fg)",
  fontSize: 12,
};

function seriesDot(item: TimeSeries) {
  if (!item.dots) return false;
  return {
    r: 3,
    fill: item.color,
    fillOpacity: 1,
    strokeOpacity: 1,
    stroke: "var(--bg-elev)",
    strokeWidth: 1,
    clipDot: false,
  };
}

function SeriesTooltipContent({
  accessibilityLayer,
  active,
  activeIndex,
  contentStyle,
  renderTooltip,
}: {
  accessibilityLayer?: boolean;
  active?: boolean;
  activeIndex?: string | null;
  contentStyle?: CSSProperties;
  renderTooltip: (index: number) => ReactNode;
}) {
  if (!active || activeIndex == null) return null;
  const index = Number(activeIndex);
  if (!Number.isInteger(index) || index < 0) return null;
  const body = renderTooltip(index);
  if (body == null || body === false) return null;
  return (
    <div
      aria-live={accessibilityLayer ? "assertive" : undefined}
      role={accessibilityLayer ? "status" : undefined}
      style={{ margin: 0, padding: 10, ...contentStyle }}
    >
      {body}
    </div>
  );
}

export function TimeSeriesChart({
  dateKeys,
  dateLabelStyle = "date",
  dateAxisLayout = "compact",
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
  renderTooltip,
  strokeWidth = 2.8,
  areaOpacity = 0.1,
  margin = defaultMargin,
  children,
}: TimeSeriesChartProps) {
  const dateDisplay = useDateDisplay();
  const alignedDates = dateAxisLayout === "aligned";
  const showTooltip = renderTooltip != null || tooltip;
  const activeDot = showTooltip ? { r: 4, clipDot: false } : false;
  const labelAt = (index: number) => {
    const key = dateKeys?.[index];
    if (!key) return labels[index] ?? "";
    return dateLabelStyle === "month_year"
      ? formatDisplayMonthYear(key, dateDisplay)
      : formatDisplayDate(key, dateDisplay);
  };
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
          height={alignedDates ? 48 : 28}
          tickSize={alignedDates ? 0 : 6}
          tickMargin={alignedDates ? 20 : 2}
          interval={alignedDates ? "preserveStartEnd" : "preserveEnd"}
          tick={
            alignedDates
              ? ({ x, y, payload }) => {
                  const first = payload.value === 0 && labels.length > 1;
                  const last = payload.value === labels.length - 1 && labels.length > 1;
                  return (
                    <Text
                      {...axisStyle}
                      x={first || last ? payload.coordinate : x}
                      y={y}
                      verticalAnchor="start"
                      textAnchor={first ? "start" : last ? "end" : "middle"}
                    >
                      {labelAt(Number(payload.value))}
                    </Text>
                  );
                }
              : axisStyle
          }
          tickFormatter={(index) => labelAt(Number(index))}
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
        {showTooltip && renderTooltip ? (
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: "var(--border-control)", strokeDasharray: "3 3" }}
            contentStyle={tooltipContentStyle}
            content={(props) => (
              <SeriesTooltipContent
                accessibilityLayer={props.accessibilityLayer}
                active={props.active}
                activeIndex={props.activeIndex}
                contentStyle={props.contentStyle}
                renderTooltip={renderTooltip}
              />
            )}
          />
        ) : null}
        {showTooltip && !renderTooltip ? (
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: "var(--border-control)", strokeDasharray: "3 3" }}
            contentStyle={tooltipContentStyle}
            labelFormatter={(index) => labelAt(Number(index))}
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
              key={`${item.label}-${index}`}
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
              dot={seriesDot(item)}
              activeDot={activeDot}
              connectNulls={false}
              isAnimationActive={false}
            />
          ) : (
            <Line
              key={`${item.label}-${index}`}
              name={item.label}
              dataKey={`value${index}`}
              type={item.curve ?? "linear"}
              stroke={item.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={seriesDot(item)}
              activeDot={activeDot}
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
