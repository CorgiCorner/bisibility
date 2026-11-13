import type { ChartMarker, ChartMarkerGeneratedTitle } from "@/lib/annotations/marker-style";

export const COMPARE_WINDOW_CAP = 28;
export const COMPARE_VERDICT_MIN_DAYS = 7;
export const COMPARE_MIN_DAILY_BASELINE = 20;
export const COMPARE_ANNOTATION_LOOKBACK_DAYS = 400;

export const compareMetrics = ["clicks", "impressions", "sessions"] as const;

export type CompareMetricId = (typeof compareMetrics)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/u;

export function compareAddDays(key: string, days: number) {
  const match = DATE_KEY.exec(key);
  if (!match) return key;
  const shifted = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days),
  );
  const year = String(shifted.getUTCFullYear()).padStart(4, "0");
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function compareDiffDays(from: string, to: string) {
  const start = DATE_KEY.exec(from);
  const end = DATE_KEY.exec(to);
  if (!start || !end) return 0;
  const startMs = Date.UTC(Number(start[1]), Number(start[2]) - 1, Number(start[3]));
  const endMs = Date.UTC(Number(end[1]), Number(end[2]) - 1, Number(end[3]));
  return Math.round((endMs - startMs) / DAY_MS);
}

function dayList(start: string, count: number) {
  const days: string[] = [];
  for (let offset = 0; offset < count; offset += 1) days.push(compareAddDays(start, offset));
  return days;
}

export type CompareWindow = {
  after: readonly string[];
  before: readonly string[];
  day: number;
  moment: string;
  phase: "finished" | "monitoring";
};

/** N days since the moment, capped at 28, and the same number of days before it. */
export function compareWindow(moment: string, asOf: string | null): CompareWindow {
  const elapsed = asOf && moment <= asOf ? compareDiffDays(moment, asOf) + 1 : 0;
  const day = Math.min(COMPARE_WINDOW_CAP, Math.max(0, elapsed));
  return {
    after: day === 0 ? [] : dayList(moment, day),
    before: day === 0 ? [] : dayList(compareAddDays(moment, -day), day),
    day,
    moment,
    phase: day >= COMPARE_WINDOW_CAP ? "finished" : "monitoring",
  };
}

export type CompareMembership = {
  changed: readonly string[];
  completeOverlap: boolean;
  overlap: readonly string[];
  unchanged: readonly string[];
};

export function compareMembership(
  changed: readonly string[],
  unchanged: readonly string[],
): CompareMembership {
  const unchangedSet = new Set(unchanged);
  const overlap = changed.filter((id) => unchangedSet.has(id));
  const overlapSet = new Set(overlap);
  const changedOnly = changed.filter((id) => !overlapSet.has(id));
  const unchangedOnly = unchanged.filter((id) => !overlapSet.has(id));
  return {
    changed: changedOnly,
    completeOverlap: overlap.length > 0 && changedOnly.length === 0 && unchangedOnly.length === 0,
    overlap,
    unchanged: unchangedOnly,
  };
}

export type CompareGroupMath = {
  after: number;
  before: number;
  lowVolume: boolean;
  pageCount: number;
  percent: number | null;
};

export type CompareVerdict =
  | { kind: "monitoring" }
  | { kind: "not_enough" }
  | { kind: "points"; points: number };

function sumDays(days: readonly string[], values: ReadonlyMap<string, number>) {
  return days.reduce((total, day) => total + (values.get(day) ?? 0), 0);
}

export function compareGroupMath(input: {
  pageCount: number;
  values: ReadonlyMap<string, number>;
  window: CompareWindow;
}): CompareGroupMath {
  const before = sumDays(input.window.before, input.values);
  const after = sumDays(input.window.after, input.values);
  const average = input.window.day === 0 ? 0 : before / input.window.day;
  const lowVolume = input.window.day > 0 && average < COMPARE_MIN_DAILY_BASELINE;
  const percent = lowVolume || before <= 0 ? null : Math.round(((after - before) / before) * 100);
  return { after, before, lowVolume, pageCount: input.pageCount, percent };
}

/** Period sums only. Fewer than 7 days, or a thin baseline, is not a verdict. */
export function compareVerdict(
  day: number,
  changed: Pick<CompareGroupMath, "percent">,
  unchanged: Pick<CompareGroupMath, "percent">,
): CompareVerdict {
  if (day < COMPARE_VERDICT_MIN_DAYS) return { kind: "monitoring" };
  if (changed.percent == null || unchanged.percent == null) return { kind: "not_enough" };
  return { kind: "points", points: changed.percent - unchanged.percent };
}

export type CompareSeriesPoint = {
  changed: number | null;
  day: string;
  unchanged: number | null;
};

function indexValue(value: number, baseline: number) {
  if (baseline <= 0) return null;
  return Math.round((value / baseline) * 1000) / 10;
}

/** Both groups indexed to their own baseline average, where that average is 100. */
export function compareIndexedSeries(input: {
  changed: ReadonlyMap<string, number>;
  changedBaseline: number;
  unchanged: ReadonlyMap<string, number>;
  unchangedBaseline: number;
  window: CompareWindow;
}): CompareSeriesPoint[] {
  if (input.window.day === 0) return [];
  const changedAverage = input.changedBaseline / input.window.day;
  const unchangedAverage = input.unchangedBaseline / input.window.day;
  return [...input.window.before, ...input.window.after].map((day) => ({
    changed: indexValue(input.changed.get(day) ?? 0, changedAverage),
    day,
    unchanged: indexValue(input.unchanged.get(day) ?? 0, unchangedAverage),
  }));
}

export type CompareAnnotationOption = {
  added?: number;
  dateKey: string;
  generated?: ChartMarkerGeneratedTitle;
  id: string;
  removed?: number;
  title: string;
};

export type CompareMetricOption = {
  disabledReason: "not_connected" | null;
  id: CompareMetricId;
};

export type CompareTagOption = {
  id: string;
  name: string;
  pages: number;
};

export type CompareGroupView = {
  lowVolume: boolean;
  pageCount: number;
  percent: number | null;
};

export type CompareResult = {
  annotation: CompareAnnotationOption;
  changed: CompareGroupView;
  day: number;
  difference: CompareVerdict;
  forecast: null;
  markers: ChartMarker[];
  moment: string;
  overlapPages: number;
  phase: CompareWindow["phase"];
  points: CompareSeriesPoint[];
  unchanged: CompareGroupView;
};

export type CompareEmpty = "choose" | "no_annotations" | "no_tags" | "overlap" | null;

export type CompareView = {
  annotationId: string | null;
  annotations: CompareAnnotationOption[];
  changedTagId: string | null;
  empty: CompareEmpty;
  metrics: CompareMetricOption[];
  result: CompareResult | null;
  selectedMetric: CompareMetricId | null;
  tags: CompareTagOption[];
  unchangedTagId: string | null;
};

/**
 * Newest annotation that is at least one finalized day old.
 * A named annotation wins. When none is old enough, the newest one is used.
 * `annotations` must already be sorted newest first.
 */
export function defaultCompareAnnotation<T extends { dateKey: string; id: string }>(
  annotations: readonly T[],
  finalizedThrough: string | null,
  requestedId?: string,
): T | null {
  const named = requestedId ? annotations.find((item) => item.id === requestedId) : undefined;
  if (named) return named;
  if (finalizedThrough) {
    const aged = annotations.find((item) => item.dateKey <= finalizedThrough);
    if (aged) return aged;
  }
  return annotations[0] ?? null;
}

export function valuesByDay(rows: readonly { day: string; value: number }[]) {
  const values = new Map<string, number>();
  for (const row of rows) {
    const day = row.day.slice(0, 10);
    values.set(day, (values.get(day) ?? 0) + row.value);
  }
  return values;
}
