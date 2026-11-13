"use client";

import { ChartMarkerTooltipList } from "@/components/charts/ChartMarkerLegend";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { chartMarkerKind } from "@/lib/annotations/marker-style";
import { annotationRulerPinCenter, layoutAnnotationRuler } from "@/lib/annotations/ruler";
import type { AnnotationEntry } from "@/lib/annotations/types";
import { useRef, useState } from "react";
import { AnnotationMarkerBadge } from "./AnnotationMarkerBadge";
import "./AnnotationsRuler.module.css";

const WIDTH = 1000;

type AnnotationsRulerProps = {
  entries: readonly AnnotationEntry[];
  label: string;
  locale: string;
  timeZone: string;
  windowEnd: string;
  windowStart: string;
};

export function AnnotationsRuler({
  entries,
  label,
  locale,
  timeZone,
  windowEnd,
  windowStart,
}: Readonly<AnnotationsRulerProps>) {
  const [width, setWidth] = useState(390);
  const observer = useRef<ResizeObserver | null>(null);
  const start = new Date(windowStart);
  const end = new Date(windowEnd);
  const formatTick = (date: Date) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone }).format(date);
  const layout = layoutAnnotationRuler({
    end,
    entries: entries.map((entry) => ({
      at: new Date(entry.happenedAt),
      endsAt: entry.endsAt ? new Date(entry.endsAt) : null,
      id: entry.id,
      marker: entry.marker,
    })),
    formatTick,
    start,
    timeZone,
    width,
  });
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const xOf = (fraction: number) => (annotationRulerPinCenter(fraction, width) / width) * WIDTH;

  function attach(node: HTMLDivElement | null) {
    observer.current?.disconnect();
    observer.current = null;
    if (!node || typeof ResizeObserver === "undefined") return;
    const next = new ResizeObserver((records) => {
      const value = records[0]?.contentRect.width ?? 0;
      if (value > 0) setWidth((current) => (current === value ? current : value));
    });
    next.observe(node);
    observer.current = next;
  }

  return (
    <div className="relative h-24 overflow-x-auto" ref={attach}>
      <svg
        preserveAspectRatio="none"
        aria-label={label}
        className="block h-24 w-full"
        role="img"
        viewBox={`0 0 ${WIDTH} 96`}
      >
        <line className="stroke-border" x1={xOf(0)} x2={xOf(1)} y1="62" y2="62" />
        {layout.bands.map((band) => (
          <rect
            className="fill-blue/30"
            data-annotation-band={band.id}
            height="6"
            key={band.id}
            width={Math.max(xOf(band.x2) - xOf(band.x1), 2)}
            x={xOf(band.x1)}
            y="59"
          />
        ))}
        {layout.ticks.map((tick) => (
          <g key={tick.label}>
            <line className="stroke-fg-muted" x1={xOf(tick.x)} x2={xOf(tick.x)} y1="58" y2="66" />
            <text
              className="fill-fg-muted"
              fontSize="11"
              textAnchor="middle"
              x={xOf(tick.x)}
              y="82"
            >
              {tick.label}
            </text>
          </g>
        ))}
      </svg>
      {layout.pins.map((pin) => {
        const markers = pin.ids.flatMap((id) => {
          const entry = byId.get(id);
          if (!entry) return [];
          return [
            {
              dateKey: entry.happenedAt.slice(0, 10),
              id: entry.id,
              kind: chartMarkerKind(entry.kind),
              source: entry.subtitle,
              title: entry.title,
            },
          ];
        });
        const letter = pin.count === 1 ? pin.marker : null;
        return (
          <span
            className="annotation-ruler-pin absolute top-9 size-4.5 -translate-x-1/2 -translate-y-1/2"
            data-annotation-pin-position=""
            key={pin.ids.join(":")}
            ref={(node) => {
              node?.style.setProperty(
                "--annotation-pin-x",
                `${annotationRulerPinCenter(pin.x, width)}px`,
              );
            }}
          >
            <Tooltip
              content={<ChartMarkerTooltipList markers={markers} />}
              placement="top"
              semantics="description"
              wrapperClassName="size-full"
            >
              <Button
                aria-label={markers.map((marker) => marker.title).join(", ")}
                className="grid size-full min-h-0 min-w-0 place-items-center rounded-full p-0"
                data-annotation-pin=""
                size="xs"
                variant="ghost"
                type="button"
              >
                <AnnotationMarkerBadge marker={letter ?? String(pin.count)} pin />
              </Button>
            </Tooltip>
          </span>
        );
      })}
    </div>
  );
}
