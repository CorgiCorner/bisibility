"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import type { ChartMarker } from "@/lib/annotations/marker-style";
import { resolveTimeSeriesAxis } from "@/lib/charts/time-series-axis";
import {
  formatDisplayDate,
  formatDisplayDateRange,
  formatDisplayMonthYear,
} from "@/lib/dates/format";
import { type ReactNode, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Text,
  XAxis,
  YAxis,
} from "recharts";
import { ChartMarkerGuides } from "./ChartMarkerGuides";
import { ChartMarkerBands, ChartMarkerPins } from "./ChartMarkerPins";
import { chartHasVisibleMarkers, layoutChartMarkers } from "./chart-marker-layout";
import { markersForPreference, useChartMarkerPreference } from "./chart-marker-preference";
import { TimeSeriesTooltips } from "./TimeSeriesTooltips";

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
  /** Annotation pins and rollout bands. Omitted charts render exactly as before. */
  markers?: readonly ChartMarker[];
  /** Project whose saved marker visibility this chart follows. */
  markerProjectRef?: string;
  series: readonly TimeSeries[];
  /** Stretch the plot to its parent's height. `height` stays the initial size. */
  fill?: boolean;
  height: number;
  min?: number;
  max?: number;
  reversed?: boolean;
  yTicks?: number[];
  yWidth?: number;
  xTickIndexes?: number[];
  formatValue?: (value: number) => string;
  showGrid?: boolean;
  showVerticalGrid?: boolean;
  gridDashed?: boolean;
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

export function TimeSeriesChart({
  dateKeys,
  dateLabelStyle = "date",
  dateAxisLayout = "compact",
  labels,
  markerProjectRef,
  markers,
  series,
  fill = false,
  height,
  min = 0,
  max,
  reversed = false,
  yTicks,
  yWidth = 42,
  xTickIndexes,
  formatValue,
  showGrid = true,
  showVerticalGrid = false,
  gridDashed = false,
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
  const { preference } = useChartMarkerPreference(markerProjectRef);
  const [activePin, setActivePin] = useState<number | null>(null);
  const visibleMarkers =
    markers && markerProjectRef ? markersForPreference(markers, preference) : (markers ?? []);
  const markerLayout =
    visibleMarkers.length > 0 ? layoutChartMarkers(dateKeys ?? [], visibleMarkers) : null;
  const hasMarkers = chartHasVisibleMarkers(markerLayout);
  const axis = resolveTimeSeriesAxis({
    ...(formatValue ? { formatValue } : {}),
    labelCount: labels.length,
    locale: dateDisplay.locale,
    ...(max !== undefined ? { max } : {}),
    min,
    series,
    ...(xTickIndexes ? { xTickIndexes } : {}),
    ...(yTicks ? { yTicks } : {}),
    yWidth,
  });
  const plotMargin = hasMarkers ? { ...margin, top: Math.max(margin.top, 36) } : margin;
  const showTooltip = renderTooltip != null || tooltip;
  const activeDot = showTooltip ? { r: 4, clipDot: false } : false;
  const labelAt = (index: number) => {
    const key = dateKeys?.[index];
    if (!key) return labels[index] ?? "";
    return dateLabelStyle === "month_year"
      ? formatDisplayMonthYear(key, dateDisplay)
      : formatDisplayDate(key, dateDisplay);
  };
  const axisLabelAt = (index: number) => {
    const key = dateKeys?.[index];
    if (!key || dateLabelStyle === "month_year") return labelAt(index);
    return formatDisplayDateRange(key, key, dateDisplay);
  };
  const data = labels.map((label, index) => ({
    index,
    label,
    ...Object.fromEntries(series.map((item, i) => [`value${i}`, item.values[index] ?? null])),
  }));
  return (
    <ResponsiveContainer
      width="100%"
      height={fill ? "100%" : height}
      minWidth={0}
      initialDimension={{ width: 600, height }}
    >
      <ComposedChart data={data} margin={plotMargin} accessibilityLayer>
        {showGrid ? (
          <CartesianGrid
            vertical={showVerticalGrid}
            stroke="var(--border)"
            strokeDasharray={gridDashed ? "3 3" : undefined}
          />
        ) : null}
        <XAxis
          dataKey="index"
          type="category"
          scale="point"
          axisLine={false}
          tickLine={false}
          height={alignedDates ? 48 : 36}
          tickSize={alignedDates ? 0 : 6}
          tickMargin={alignedDates ? 20 : 10}
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
                      {axisLabelAt(Number(payload.value))}
                    </Text>
                  );
                }
              : axisStyle
          }
          tickFormatter={(index) => axisLabelAt(Number(index))}
          ticks={axis.categoryTicks.length > 0 ? axis.categoryTicks : undefined}
          minTickGap={16}
        />
        <YAxis
          tickMargin={10}
          domain={[min, max ?? "auto"]}
          allowDataOverflow={max !== undefined}
          reversed={reversed}
          hide={!showYAxis}
          width={showYAxis ? axis.yAxisWidth : 0}
          axisLine={false}
          tickLine={false}
          ticks={yTicks}
          tickCount={5}
          tick={axisStyle}
          tickFormatter={axis.formatTick}
          allowDecimals={false}
        />
        <TimeSeriesTooltips
          formatValue={formatValue}
          hasMarkers={hasMarkers}
          labelAt={labelAt}
          markerLayout={markerLayout}
          renderTooltip={renderTooltip}
          series={series}
          showTooltip={showTooltip}
        />
        {hasMarkers && markerLayout ? <ChartMarkerBands bands={markerLayout.bands} /> : null}
        {hasMarkers && markerLayout ? (
          <ChartMarkerGuides activeIndex={activePin} pins={markerLayout.pins} />
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
        {hasMarkers && markerLayout ? (
          <ChartMarkerPins
            activeIndex={activePin}
            labelAt={labelAt}
            onActiveChange={setActivePin}
            pins={markerLayout.pins}
            projectRef={markerProjectRef}
          />
        ) : null}
        {children}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
