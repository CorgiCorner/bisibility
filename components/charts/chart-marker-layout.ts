import {
  type ChartMarker,
  type ChartMarkerKind,
  markerLetter,
} from "@/lib/annotations/marker-style";
import type { AnnotationMarker } from "@/lib/annotations/types";

export type ChartMarkerPin = {
  count: number;
  dateKey: string;
  index: number;
  kind: ChartMarkerKind | null;
  letter: AnnotationMarker | null;
  markers: readonly ChartMarker[];
};

export type ChartMarkerBand = {
  endIndex: number;
  id: string;
  kind: ChartMarkerKind;
  startIndex: number;
};

export type ChartMarkerLayout = {
  bands: readonly ChartMarkerBand[];
  byIndex: ReadonlyMap<number, readonly ChartMarker[]>;
  pins: readonly ChartMarkerPin[];
};

const emptyLayout: ChartMarkerLayout = {
  bands: [],
  byIndex: new Map(),
  pins: [],
};

function indexSpan(dateKeys: readonly string[], start: string, end: string) {
  let startIndex = -1;
  let endIndex = -1;
  for (let index = 0; index < dateKeys.length; index += 1) {
    const key = dateKeys[index];
    if (!key || key < start || key > end) continue;
    if (startIndex < 0) startIndex = index;
    endIndex = index;
  }
  if (startIndex < 0 || endIndex < 0) return null;
  return { endIndex, startIndex };
}

function pinAt(groups: Map<number, ChartMarker[]>, index: number, marker: ChartMarker) {
  const group = groups.get(index) ?? [];
  group.push(marker);
  groups.set(index, group);
}

/**
 * Drops markers outside the plotted days, clips a band to the days that are plotted, and
 * folds every pin that lands on one day into a single pin.
 */
export function layoutChartMarkers(
  dateKeys: readonly string[],
  markers: readonly ChartMarker[],
): ChartMarkerLayout {
  if (dateKeys.length === 0 || markers.length === 0) return emptyLayout;
  const indexByKey = new Map<string, number>();
  for (let index = 0; index < dateKeys.length; index += 1) {
    const key = dateKeys[index];
    if (key && !indexByKey.has(key)) indexByKey.set(key, index);
  }
  const bands: ChartMarkerBand[] = [];
  const pinGroups = new Map<number, ChartMarker[]>();
  const covered = new Map<number, ChartMarker[]>();

  for (const marker of markers) {
    if (marker.endDateKey) {
      const span = indexSpan(dateKeys, marker.dateKey, marker.endDateKey);
      if (!span) continue;
      bands.push({ ...span, id: marker.id, kind: marker.kind });
      pinAt(pinGroups, span.startIndex, marker);
      for (let index = span.startIndex; index <= span.endIndex; index += 1) {
        const day = covered.get(index) ?? [];
        day.push(marker);
        covered.set(index, day);
      }
      continue;
    }
    const index = indexByKey.get(marker.dateKey);
    if (index === undefined) continue;
    pinAt(pinGroups, index, marker);
    const day = covered.get(index) ?? [];
    day.push(marker);
    covered.set(index, day);
  }

  const pins = [...pinGroups.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([index, group]) => {
      const kinds = new Set(group.map((marker) => marker.kind));
      const kind = kinds.size === 1 ? group[0].kind : null;
      return {
        count: group.length,
        dateKey: dateKeys[index] ?? group[0].dateKey,
        index,
        kind,
        letter: kind ? markerLetter(kind) : null,
        markers: group,
      };
    });

  return { bands, byIndex: covered, pins };
}

/** Pixel radius of a chart pin. The circle and its letter stay inside this radius. */
export const CHART_MARKER_PIN_RADIUS = 9;

/**
 * Keeps the whole pin inside the top margin and inside the plot's horizontal span.
 * Edge days shift inward instead of drawing a centre the chart would clip.
 */
export function chartMarkerPinCenter(input: {
  plotWidth: number;
  plotX: number;
  plotY: number;
  radius?: number;
  x: number;
}) {
  const radius = input.radius ?? CHART_MARKER_PIN_RADIUS;
  const left = input.plotX + radius;
  const right = input.plotX + input.plotWidth - radius;
  const cx =
    right < left ? input.plotX + input.plotWidth / 2 : Math.min(Math.max(input.x, left), right);
  const lower = Math.max(radius, input.plotY - radius);
  const cy = Math.min(Math.max(input.plotY / 2, radius), lower);
  return { cx, cy };
}

export function chartMarkersAtIndex(layout: ChartMarkerLayout, index: number) {
  return layout.byIndex.get(index) ?? [];
}

/** Vertical guide from the pin's bottom edge to the plot baseline. x is the pin centre. */
export function chartMarkerGuideLine(input: {
  baselineY: number;
  cx: number;
  cy: number;
  radius?: number;
}) {
  const radius = input.radius ?? CHART_MARKER_PIN_RADIUS;
  return { x: input.cx, y1: input.cy + radius, y2: input.baselineY };
}

export function chartHasVisibleMarkers(layout: ChartMarkerLayout | null) {
  return Boolean(layout && (layout.pins.length > 0 || layout.bands.length > 0));
}
