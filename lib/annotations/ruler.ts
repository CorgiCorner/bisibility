import type { AnnotationMarker } from "./types";

export const RULER_PIN_DIAMETER = 18;
const RULER_VIEWBOX = 1000;
const RULER_PAD = 28;

/** Screen-pixel centre of a pin fraction on a ruler of `width` pixels. */
export function annotationRulerPinCenter(fraction: number, width: number) {
  const pad = Math.max((RULER_PAD / RULER_VIEWBOX) * width, RULER_PIN_DIAMETER / 2);
  return pad + fraction * (width - pad * 2);
}

export type RulerPoint = {
  at: Date;
  endsAt?: Date | null;
  id: string;
  marker: AnnotationMarker;
};

export type RulerPin = {
  count: number;
  ids: readonly string[];
  marker: AnnotationMarker | null;
  x: number;
};

export type RulerBand = {
  id: string;
  x1: number;
  x2: number;
};

export type RulerTick = {
  label: string;
  x: number;
};

export type RulerLayout = {
  bands: RulerBand[];
  pins: RulerPin[];
  ticks: RulerTick[];
};

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function annotationDayKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(date);
}

function fraction(date: Date, start: Date, end: Date) {
  const span = Math.max(end.getTime() - start.getTime(), 1);
  return clamp((date.getTime() - start.getTime()) / span);
}

function zoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    month: value("month"),
    second: value("second"),
    year: value("year"),
  };
}

function zoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = zoneParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}

function zonedDayStart(date: Date, timeZone: string) {
  const parts = zoneParts(date, timeZone);
  const guess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return new Date(guess.getTime() - zoneOffsetMinutes(guess, timeZone) * 60_000);
}

function zonedMonthStart(year: number, month: number, timeZone: string) {
  const guess = new Date(Date.UTC(year, month - 1, 1));
  return new Date(guess.getTime() - zoneOffsetMinutes(guess, timeZone) * 60_000);
}

/** Month boundaries inside the window, plus the window start and end. */
export function annotationRulerTicks(start: Date, end: Date, timeZone: string) {
  const ticks = [new Date(start)];
  const origin = zoneParts(start, timeZone);
  let year = origin.year;
  let month = origin.month + 1;
  for (let index = 0; index < 6; index += 1) {
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const at = zonedMonthStart(year, month, timeZone);
    if (at > start && at < end) ticks.push(at);
    if (at >= end) break;
    month += 1;
  }
  const last = ticks[ticks.length - 1];
  if (annotationDayKey(end, timeZone) !== annotationDayKey(last, timeZone))
    ticks.push(new Date(end));
  return ticks;
}

/**
 * Places pins on their project day and merges any whose centres are closer
 * than one pin diameter. There is no second lane.
 */
export function layoutAnnotationRuler(input: {
  end: Date;
  entries: readonly RulerPoint[];
  formatTick: (date: Date) => string;
  start: Date;
  timeZone: string;
  width?: number;
}): RulerLayout {
  const width = input.width ?? 1440;
  const placed = input.entries
    .map((entry) => ({
      id: entry.id,
      marker: entry.marker,
      x: fraction(zonedDayStart(entry.at, input.timeZone), input.start, input.end),
    }))
    .sort((left, right) => left.x - right.x);
  const pins: RulerPin[] = [];
  for (const pin of placed) {
    const last = pins[pins.length - 1];
    const close =
      last !== undefined &&
      Math.abs(annotationRulerPinCenter(pin.x, width) - annotationRulerPinCenter(last.x, width)) <
        RULER_PIN_DIAMETER;
    if (last && close) {
      pins[pins.length - 1] = {
        count: last.count + 1,
        ids: [...last.ids, pin.id],
        marker: last.marker === pin.marker ? last.marker : null,
        x: last.x,
      };
      continue;
    }
    pins.push({ count: 1, ids: [pin.id], marker: pin.marker, x: pin.x });
  }
  const bands = input.entries.flatMap((entry) => {
    if (!entry.endsAt || entry.endsAt.getTime() <= entry.at.getTime()) return [];
    return [
      {
        id: entry.id,
        x1: fraction(entry.at, input.start, input.end),
        x2: fraction(entry.endsAt, input.start, input.end),
      },
    ];
  });
  const ticks = annotationRulerTicks(input.start, input.end, input.timeZone).map((at) => ({
    label: input.formatTick(at),
    x: fraction(at, input.start, input.end),
  }));
  return { bands, pins, ticks };
}
