import { addDays } from "@/lib/search-insights/dates";
import {
  NORMAL_SEARCH_SYNC_REQUEST_SETS_PER_HOUR,
  SEARCH_SYNC_DIMENSIONAL_SETS_PER_DAY,
} from "@/lib/search-insights/sync/plan";

const REQUIRED_DIMENSIONS = new Set(["query", "page", "query,page"]);
const TARGET_DAYS = 28;
const HOUR_MS = 60 * 60 * 1_000;
const MAX_INTEGER = Number.MAX_SAFE_INTEGER;

type ReadyRange = { current: boolean; previous: boolean };

export type DurablePartition = { date: string; dimensions: string; fetchedAt: string };
export type DurableAggregateRange = {
  dataState: string;
  dimensions: string;
  endDate: string;
  operation: string;
  persistedAt: string | null;
  searchType: string;
  source: string;
  startDate: string;
};
export type ImportObservabilityFacts = {
  qualifyingDays: number;
  consecutiveDays: number;
  targetDays: number;
  readyThrough: { d7: ReadyRange; d28: ReadyRange; d90: ReadyRange };
  deepHistoryMonths: { completed: number; target: number };
  lastActivityAt: string | null;
  lastProbeAt: string | null;
  stall: {
    expectedBatchMs: number;
    expectedDayMs: number;
    nextRequestInMs: number;
    silenceMs: number;
    thresholdMs: number;
  };
};

export type ImportObservabilityInput = {
  aggregateRanges?: readonly DurableAggregateRange[];
  batchSize?: number;
  boundary: string | null;
  daysTotal: number;
  earliestTargetDate?: string | null;
  lastProbeAt?: string | null;
  latestRequestAttemptAt?: string | null;
  now: Date;
  plannedRetentionMonths?: number;
  requestSetsPerHour?: number;
  rows: readonly DurablePartition[];
};

function nonNegativeInteger(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_INTEGER, Math.max(0, Math.round(value)));
}

function positiveInteger(value: number | undefined, fallback: number) {
  return value && Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value)) : fallback;
}

function timestamp(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value: string | null | undefined) {
  const parsed = timestamp(value);
  return parsed ? new Date(parsed).toISOString() : null;
}

function completeDays(rows: readonly DurablePartition[]) {
  const dimensions = new Map<string, Set<string>>();
  const completedAt = new Map<string, number>();
  for (const row of rows) {
    if (!REQUIRED_DIMENSIONS.has(row.dimensions)) continue;
    const keys = dimensions.get(row.date) ?? new Set<string>();
    keys.add(row.dimensions);
    dimensions.set(row.date, keys);
    completedAt.set(row.date, Math.max(completedAt.get(row.date) ?? 0, timestamp(row.fetchedAt)));
  }
  return [...dimensions.entries()]
    .filter(([, keys]) => keys.size === REQUIRED_DIMENSIONS.size)
    .map(([date]) => ({ date, completedAt: completedAt.get(date) ?? 0 }));
}

function aggregateCovers(ranges: readonly DurableAggregateRange[], start: string, end: string) {
  return ranges.some(
    (range) =>
      range.operation === "aggregate" &&
      range.source === "gsc" &&
      range.searchType === "web" &&
      range.dataState === "final" &&
      range.dimensions === "date" &&
      range.persistedAt !== null &&
      range.startDate <= start &&
      range.endDate >= end,
  );
}

function rangeReady(
  days: ReadonlySet<string>,
  ranges: readonly DurableAggregateRange[],
  end: string,
  length: number,
) {
  const start = addDays(end, -(length - 1));
  if (!aggregateCovers(ranges, start, end)) return false;
  for (let offset = 0; offset < length; offset += 1) {
    if (!days.has(addDays(end, -offset))) return false;
  }
  return true;
}

function readyThrough(
  days: ReadonlySet<string>,
  ranges: readonly DurableAggregateRange[],
  boundary: string | null,
): ImportObservabilityFacts["readyThrough"] {
  if (!boundary) {
    return {
      d7: { current: false, previous: false },
      d28: { current: false, previous: false },
      d90: { current: false, previous: false },
    };
  }
  const ready = (length: number): ReadyRange => {
    const previousEnd = addDays(boundary, -length);
    return {
      current: rangeReady(days, ranges, boundary, length),
      previous: rangeReady(days, ranges, previousEnd, length),
    };
  };
  return { d7: ready(7), d28: ready(28), d90: ready(90) };
}

function consecutiveDays(days: ReadonlySet<string>, boundary: string | null) {
  if (!boundary) return 0;
  let completed = 0;
  while (days.has(addDays(boundary, -completed))) completed += 1;
  return completed;
}

export function selectImportObservabilityFacts(
  input: ImportObservabilityInput,
): ImportObservabilityFacts {
  const days = completeDays(input.rows).filter(
    ({ date }) =>
      (!input.earliestTargetDate || date >= input.earliestTargetDate) &&
      (!input.boundary || date <= input.boundary),
  );
  const available = new Set(days.map(({ date }) => date));
  const completion = days.reduce((latest, day) => Math.max(latest, day.completedAt), 0);
  const activity = Math.max(completion, timestamp(input.latestRequestAttemptAt));
  const now = Number.isFinite(input.now.getTime()) ? input.now.getTime() : 0;
  const batchSize = positiveInteger(input.batchSize, 7);
  const requestSetsPerHour = positiveInteger(
    input.requestSetsPerHour,
    NORMAL_SEARCH_SYNC_REQUEST_SETS_PER_HOUR,
  );
  const expectedDayMs = nonNegativeInteger(
    (SEARCH_SYNC_DIMENSIONAL_SETS_PER_DAY * HOUR_MS) / requestSetsPerHour,
  );
  const expectedBatchMs = nonNegativeInteger(
    (batchSize * SEARCH_SYNC_DIMENSIONAL_SETS_PER_DAY * HOUR_MS) / requestSetsPerHour,
  );
  const silenceMs = nonNegativeInteger(activity ? Math.max(0, now - activity) : 0);
  const thresholdMs = nonNegativeInteger(expectedBatchMs * 1.5);
  const qualifyingStart = input.boundary ? addDays(input.boundary, -(TARGET_DAYS - 1)) : null;
  const qualifyingDays = qualifyingStart
    ? [...available].filter((date) => date >= qualifyingStart).length
    : 0;
  const consecutive = consecutiveDays(available, input.boundary);
  const targetMonths =
    input.plannedRetentionMonths === undefined
      ? Math.floor(nonNegativeInteger(input.daysTotal) / 30)
      : nonNegativeInteger(input.plannedRetentionMonths);
  return {
    qualifyingDays,
    consecutiveDays: consecutive,
    targetDays: TARGET_DAYS,
    readyThrough: readyThrough(available, input.aggregateRanges ?? [], input.boundary),
    deepHistoryMonths: {
      completed: Math.min(targetMonths, Math.floor(consecutive / 30)),
      target: targetMonths,
    },
    lastActivityAt: activity ? new Date(activity).toISOString() : null,
    lastProbeAt: iso(input.lastProbeAt),
    stall: {
      expectedBatchMs,
      expectedDayMs,
      nextRequestInMs: nonNegativeInteger(Math.max(0, expectedBatchMs - silenceMs)),
      silenceMs,
      thresholdMs,
    },
  };
}

export function summarizeImportObservability(
  input: ImportObservabilityInput,
): ImportObservabilityFacts {
  return selectImportObservabilityFacts(input);
}
