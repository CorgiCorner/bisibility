"use client";

import type { ReactNode } from "react";
import { Tooltip } from "recharts";
import { ChartMarkerDayValues, ChartMarkerTooltipList } from "./ChartMarkerLegend";
import { type ChartMarkerLayout, chartMarkersAtIndex } from "./chart-marker-layout";
import { SeriesTooltipContent } from "./SeriesTooltipContent";
import type { TimeSeries } from "./TimeSeriesChart";

const tooltipContentStyle = {
  background: "var(--bg-elev)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--fg)",
  fontSize: 12,
};

const cursor = { stroke: "var(--border-control)", strokeDasharray: "3 3" };

export function TimeSeriesTooltips({
  formatValue,
  hasMarkers,
  labelAt,
  markerLayout,
  renderTooltip,
  series,
  showTooltip,
}: Readonly<{
  formatValue?: (value: number) => string;
  hasMarkers: boolean;
  labelAt: (index: number) => string;
  markerLayout: ChartMarkerLayout | null;
  renderTooltip?: (index: number) => ReactNode;
  series: readonly TimeSeries[];
  showTooltip: boolean;
}>) {
  if (!showTooltip) return null;
  if (renderTooltip) {
    return (
      <Tooltip
        isAnimationActive={false}
        cursor={cursor}
        contentStyle={tooltipContentStyle}
        content={(props) => (
          <SeriesTooltipContent
            accessibilityLayer={props.accessibilityLayer}
            active={props.active}
            activeIndex={props.activeIndex}
            renderTooltip={(index) => {
              const body = renderTooltip(index);
              const dayMarkers = markerLayout ? chartMarkersAtIndex(markerLayout, index) : [];
              if ((body == null || body === false) && dayMarkers.length === 0) return null;
              return (
                <>
                  {body}
                  <ChartMarkerTooltipList markers={dayMarkers} />
                </>
              );
            }}
          />
        )}
      />
    );
  }
  if (hasMarkers) {
    return (
      <Tooltip
        isAnimationActive={false}
        cursor={cursor}
        contentStyle={tooltipContentStyle}
        content={(props) => (
          <SeriesTooltipContent
            accessibilityLayer={props.accessibilityLayer}
            active={props.active}
            activeIndex={props.activeIndex}
            renderTooltip={(index) => (
              <ChartMarkerDayValues
                formatValue={formatValue}
                index={index}
                label={labelAt(index)}
                markers={markerLayout ? chartMarkersAtIndex(markerLayout, index) : []}
                series={series}
              />
            )}
          />
        )}
      />
    );
  }
  return (
    <Tooltip
      isAnimationActive={false}
      cursor={cursor}
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
  );
}
