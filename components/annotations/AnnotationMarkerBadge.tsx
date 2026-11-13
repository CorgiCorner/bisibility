import {
  markerToneContent,
  markerToneDeploy,
  markerToneNote,
  markerToneSearchEngine,
  markerToneSitemap,
} from "@/lib/annotations/marker-style";
import { cn } from "@/lib/ui/cn";
import type { ReactNode } from "react";

// Geist SemiBold: unitsPerEm=1000, sCapHeight=710 (OS/2). The baseline sits
// half a cap height below the circle centre; no HTML line-box descent is involved.
export const MARKER_CAP_BASELINE = (11 * 710) / 1000 / 2;

// [left bearing, right bearing] in the same font units. Centre ink, including
// asymmetric digits such as 1, rather than centring their advance width.
export const MARKER_INK_BEARINGS: Readonly<Record<string, readonly [number, number]>> = {
  C: [43, 38],
  D: [80, 39],
  G: [43, 48],
  N: [80, 80],
  S: [53, 53],
  "0": [46, 46],
  "1": [38, 107],
  "2": [59, 58],
  "3": [46, 46],
  "4": [26, 46],
  "5": [57, 58],
  "6": [46, 36],
  "7": [20, 0],
  "8": [36, 36],
  "9": [36, 46],
};
export function markerInkXOffset(marker: string) {
  const left = MARKER_INK_BEARINGS[marker[0]]?.[0] ?? 0;
  const right = MARKER_INK_BEARINGS[marker.at(-1) ?? ""]?.[1] ?? 0;
  return (11 * (right - left)) / 1000 / 2;
}

export function AnnotationMarkerGlyph({
  marker,
  x = 9,
  y = 9,
}: Readonly<{ marker: string; x?: number; y?: number }>) {
  return (
    <text
      className="select-none fill-current font-sans font-semibold"
      fontSize={11}
      textAnchor="middle"
      x={x + markerInkXOffset(marker)}
      y={y + MARKER_CAP_BASELINE}
    >
      {marker}
    </text>
  );
}

export function AnnotationMarkerBadge({
  marker,
  pin = false,
  inheritTone = false,
}: Readonly<{ marker: string; pin?: boolean; inheritTone?: boolean }>) {
  return (
    <svg
      aria-hidden
      className={cn(
        "shrink-0 overflow-visible",
        pin ? "size-4.5" : "size-4",
        !inheritTone && marker === "C" && markerToneContent,
        !inheritTone && marker === "D" && markerToneDeploy,
        !inheritTone && marker === "G" && markerToneSearchEngine,
        !inheritTone && marker === "N" && markerToneNote,
        !inheritTone && marker === "S" && markerToneSitemap,
      )}
      data-annotation-badge=""
      viewBox="0 0 18 18"
    >
      <circle
        className="fill-bg-elev stroke-current"
        cx={9}
        cy={9}
        r={pin ? 8.25 : 8}
        strokeWidth={1.5}
      />
      <AnnotationMarkerGlyph marker={marker} />
    </svg>
  );
}

export function AnnotationEntryRow({
  marker,
  source,
  title,
  inheritTone = false,
}: Readonly<{ marker: string; source?: ReactNode; title: ReactNode; inheritTone?: boolean }>) {
  return (
    <span className="flex min-w-0 items-start gap-2 text-ui-caption" data-annotation-entry="">
      <span className="flex h-lh shrink-0 items-center">
        <AnnotationMarkerBadge inheritTone={inheritTone} marker={marker} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-fg">{title}</span>
        {source ? <span className="block text-fg-muted">{source}</span> : null}
      </span>
    </span>
  );
}

export function AnnotationMarkerPin({
  marker,
  x,
  y,
}: Readonly<{ marker: string; x: number; y: number }>) {
  return (
    <svg height={18} width={18} x={x - 9} y={y - 9}>
      <AnnotationMarkerBadge marker={marker} pin />
    </svg>
  );
}
