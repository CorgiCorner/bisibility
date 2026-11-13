"use client";

import {
  markerToneContent,
  markerToneDeploy,
  markerToneNote,
  markerToneSearchEngine,
  markerToneSitemap,
} from "@/lib/annotations/marker-style";
import { usePlotArea, useXAxisScale } from "recharts";
import type { ChartMarkerPin } from "./chart-marker-layout";
import { chartMarkerGuideLine, chartMarkerPinCenter } from "./chart-marker-layout";

export function ChartMarkerGuides({
  activeIndex,
  pins,
}: Readonly<{
  activeIndex: number | null;
  pins: readonly ChartMarkerPin[];
}>) {
  const plot = usePlotArea();
  const scale = useXAxisScale();
  if (!plot || !scale || pins.length === 0) return null;
  const baselineY = plot.y + plot.height;
  const dim = activeIndex !== null;
  return (
    <g data-chart-marker="guides">
      {pins.map((pin) => {
        const scaled = scale(pin.index);
        if (typeof scaled !== "number" || Number.isNaN(scaled)) return null;
        const { cx, cy } = chartMarkerPinCenter({
          plotWidth: plot.width,
          plotX: plot.x,
          plotY: plot.y,
          x: scaled,
        });
        const line = chartMarkerGuideLine({ baselineY, cx, cy });
        const active = activeIndex === pin.index;
        const tone =
          pin.kind === "content"
            ? markerToneContent
            : pin.kind === "deploy"
              ? markerToneDeploy
              : pin.kind === "note"
                ? markerToneNote
                : pin.kind === "search_engine"
                  ? markerToneSearchEngine
                  : pin.kind === "sitemap"
                    ? markerToneSitemap
                    : "text-fg";
        return (
          <line
            className={tone}
            data-chart-marker="guide"
            key={pin.index}
            stroke="currentColor"
            strokeDasharray={active ? undefined : "3 3"}
            strokeOpacity={active ? 1 : dim ? 0.2 : 0.45}
            strokeWidth={1}
            x1={line.x}
            x2={line.x}
            y1={line.y1}
            y2={line.y2}
          />
        );
      })}
    </g>
  );
}
