"use client";

import { AnnotationMarkerGlyph } from "@/components/annotations/AnnotationMarkerBadge";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverPortal,
} from "@/components/ui/primitives/popover";
import {
  markerFill,
  markerToneContent,
  markerToneDeploy,
  markerToneNote,
  markerToneSearchEngine,
  markerToneSitemap,
} from "@/lib/annotations/marker-style";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { cn } from "@/lib/ui/cn";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useRef, useState } from "react";
import { ReferenceArea, usePlotArea, useXAxisScale } from "recharts";
import { ChartMarkerPinBody, chartMarkerKindLabel } from "./ChartMarkerLegend";
import "./ChartMarkerPins.module.css";
import type { ChartMarkerBand, ChartMarkerPin } from "./chart-marker-layout";
import { CHART_MARKER_PIN_RADIUS, chartMarkerPinCenter } from "./chart-marker-layout";

export function ChartMarkerBands({ bands }: Readonly<{ bands: readonly ChartMarkerBand[] }>) {
  return bands.map((band) => (
    <ReferenceArea
      fill={markerFill(band.kind)}
      fillOpacity={0.12}
      ifOverflow="hidden"
      key={band.id}
      strokeOpacity={0}
      x1={band.startIndex}
      x2={band.endIndex}
    />
  ));
}

function annotationHref(projectRef: string, id: string) {
  return `${appPath(asProjectRef(projectRef), "annotations")}?q=${encodeURIComponent(id)}`;
}

export function ChartMarkerPins({
  activeIndex,
  labelAt,
  onActiveChange,
  pins,
  projectRef,
}: Readonly<{
  activeIndex: number | null;
  labelAt: (index: number) => string;
  onActiveChange: (index: number | null) => void;
  pins: readonly ChartMarkerPin[];
  projectRef?: string;
}>) {
  const t = useTranslations("shared.chartMarkers");
  const plot = usePlotArea();
  const scale = useXAxisScale();
  if (!plot || !scale || pins.length === 0) return null;
  const dim = activeIndex !== null;
  return (
    <g>
      {pins.map((pin) => {
        const scaled = scale(pin.index);
        if (typeof scaled !== "number" || Number.isNaN(scaled)) return null;
        const { cx, cy } = chartMarkerPinCenter({
          plotWidth: plot.width,
          plotX: plot.x,
          plotY: plot.y,
          x: scaled,
        });
        const date = labelAt(pin.index);
        const marker = pin.markers[0];
        const name =
          pin.count === 1 && marker
            ? t("pinLabel", { date, type: t(chartMarkerKindLabel[marker.kind]) })
            : t("pinClusterLabel", { count: pin.count, date });
        const label = pin.count === 1 && pin.letter ? pin.letter : String(pin.count);
        const href = projectRef && marker ? annotationHref(projectRef, marker.id) : undefined;
        const diameter = CHART_MARKER_PIN_RADIUS * 2;
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
          <g className={cn(tone, dim && activeIndex !== pin.index && "opacity-40")} key={pin.index}>
            <circle
              className="fill-bg-elev stroke-current"
              cx={cx}
              cy={cy}
              data-chart-marker="pin"
              r={CHART_MARKER_PIN_RADIUS}
              strokeWidth={1.5}
            />
            <foreignObject
              className="overflow-visible"
              height={diameter}
              width={diameter}
              x={cx - CHART_MARKER_PIN_RADIUS}
              y={cy - CHART_MARKER_PIN_RADIUS}
            >
              <PinControl
                href={pin.count === 1 ? href : undefined}
                name={name}
                onActive={() => onActiveChange(pin.index)}
                onInactive={() => onActiveChange(null)}
                tooltip={<ChartMarkerPinBody date={date} pin={pin} projectRef={projectRef} />}
              >
                <svg aria-hidden className="size-full overflow-visible" viewBox="0 0 18 18">
                  <AnnotationMarkerGlyph marker={label} />
                </svg>
              </PinControl>
            </foreignObject>
          </g>
        );
      })}
    </g>
  );
}

export function PinControl({
  children,
  href,
  name,
  onActive,
  onInactive,
  tooltip,
}: Readonly<{
  children: ReactNode;
  href?: string;
  name: string;
  onActive: () => void;
  onInactive: () => void;
  tooltip: ReactNode;
}>) {
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLAnchorElement>(null);
  const touching = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function change(next: boolean) {
    clearTimeout(closeTimer.current);
    setOpen(next);
    if (next) onActive();
    else onInactive();
  }
  function leave() {
    if (touching.current) return;
    closeTimer.current = setTimeout(() => change(false), 100);
  }
  return (
    <Popover open={open} onOpenChange={change}>
      <PopoverAnchor asChild>
        <a
          aria-describedby={descriptionId}
          aria-label={name}
          aria-expanded={open}
          aria-haspopup="dialog"
          className={cn(
            "grid size-full select-none place-items-center rounded-full border-0 bg-transparent p-0 text-current outline-none focus-visible:ring-2 focus-visible:ring-accent-solid focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elev",
            "annotation-pin-control",
          )}
          href={href}
          ref={(node) => {
            anchor.current = node;
            return () => {
              clearTimeout(closeTimer.current);
            };
          }}
          role={href ? undefined : "button"}
          tabIndex={0}
          onBlur={(event) => {
            if (!event.relatedTarget?.closest?.("[data-marker-hover-card]")) change(false);
          }}
          onFocus={() => change(true)}
          onPointerEnter={(event) => {
            if (event.pointerType !== "touch") {
              touching.current = false;
              change(true);
            }
          }}
          onPointerLeave={leave}
          onPointerDown={(event) => {
            touching.current = event.pointerType === "touch";
            if (touching.current) {
              event.preventDefault();
              change(true);
            }
          }}
          onClick={(event) => {
            if (touching.current || !href) {
              event.preventDefault();
              change(true);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              change(false);
            } else if (event.key === "Enter" && !href) {
              event.preventDefault();
              change(true);
            }
          }}
        >
          {children}
        </a>
      </PopoverAnchor>
      <span hidden id={descriptionId}>
        {tooltip}
      </span>
      <PopoverPortal>
        <PopoverContent
          aria-label={name}
          data-marker-hover-card=""
          side="top"
          sideOffset={8}
          collisionBoundary={anchor.current?.closest('[data-slot="card"]') ?? undefined}
          collisionPadding={{ top: 8, right: 8, bottom: 56, left: 8 }}
          sticky="always"
          style={{
            maxWidth: "var(--radix-popover-content-available-width)",
            maxHeight: "var(--radix-popover-content-available-height)",
          }}
          className="z-50 max-h-64 w-70 max-w-full overflow-y-auto rounded-card border border-border bg-bg-elev px-2.5 py-2 text-ui-caption text-fg shadow-sm"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={() => change(false)}
          onPointerDownOutside={() => change(false)}
          onPointerEnter={() => {
            clearTimeout(closeTimer.current);
          }}
          onPointerLeave={leave}
        >
          {tooltip}
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}
