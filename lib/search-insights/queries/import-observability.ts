import { addDays } from "@/lib/search-insights/dates";

const REQUIRED_DIMENSIONS = new Set(["query", "page", "query,page"]);
const FIRST_VIEW_DAYS = 28;
const WAITING_MS = 10 * 60_000;
const MIN_ETA_SAMPLES = 3;

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
export type ImportObservability = {
  completedDays: number;
  etaLabel: string | null;
  firstViewReady: boolean;
  localReadableThrough: string | null;
  lastActivityAt: string | null;
  waiting: boolean;
};

function completeDays(rows: readonly DurablePartition[]) {
  const dimensions = new Map<string, Set<string>>();
  const completedAt = new Map<string, number>();
  for (const row of rows) {
    if (!REQUIRED_DIMENSIONS.has(row.dimensions)) continue;
    const keys = dimensions.get(row.date) ?? new Set<string>();
    keys.add(row.dimensions);
    dimensions.set(row.date, keys);
    completedAt.set(row.date, Math.max(completedAt.get(row.date) ?? 0, Date.parse(row.fetchedAt)));
  }
  return [...dimensions.entries()]
    .filter(([, keys]) => keys.size === REQUIRED_DIMENSIONS.size)
    .map(([date]) => ({ date, completedAt: completedAt.get(date) ?? 0 }))
    .sort((a, b) => b.date.localeCompare(a.date));
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

function readiness(
  days: readonly { date: string }[],
  boundary: string | null,
  ranges: readonly DurableAggregateRange[],
) {
  if (!boundary) return false;
  const start = addDays(boundary, -(FIRST_VIEW_DAYS - 1));
  if (!aggregateCovers(ranges, start, boundary)) return false;
  const available = new Set(days.map(({ date }) => date));
  for (let offset = 0; offset < FIRST_VIEW_DAYS; offset += 1) {
    if (!available.has(addDays(boundary, -offset))) return false;
  }
  return true;
}

function eta(days: readonly { completedAt: number }[], daysTotal: number, now: Date) {
  const samples = days
    .map(({ completedAt }) => completedAt)
    .filter(Boolean)
    .sort((a, b) => a - b)
    .slice(-8);
  if (samples.length < MIN_ETA_SAMPLES) return null;
  const latest = samples.at(-1);
  if (latest === undefined) return null;
  const elapsed = latest - samples[0];
  if (elapsed <= 0) return null;
  const perDay = elapsed / (samples.length - 1);
  const remainingMs = Math.max(0, daysTotal - days.length) * perDay;
  const estimateDays = Math.max(1, Math.round(remainingMs / 86_400_000));
  const finish = new Date(now.getTime() + remainingMs).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
  return `about ${estimateDays} ${estimateDays === 1 ? "day" : "days"} left (finishes ~${finish})`;
}

export function summarizeImportObservability(input: {
  aggregateRanges?: readonly DurableAggregateRange[];
  boundary: string | null;
  earliestTargetDate?: string | null;
  daysTotal: number;
  latestRequestAttemptAt?: string | null;
  now: Date;
  rows: readonly DurablePartition[];
}): ImportObservability {
  const days = completeDays(input.rows).filter(
    ({ date }) =>
      (!input.earliestTargetDate || date >= input.earliestTargetDate) &&
      (!input.boundary || date <= input.boundary),
  );
  const completion = days.reduce((latest, day) => Math.max(latest, day.completedAt), 0);
  const request = input.latestRequestAttemptAt ? Date.parse(input.latestRequestAttemptAt) : 0;
  const activity = Math.max(completion, request);
  const waiting = activity > 0 && input.now.getTime() - activity > WAITING_MS;
  const firstViewReady = readiness(days, input.boundary, input.aggregateRanges ?? []);
  return {
    completedDays: days.length,
    etaLabel: waiting ? null : eta(days, input.daysTotal, input.now),
    firstViewReady,
    localReadableThrough: firstViewReady ? input.boundary : null,
    lastActivityAt: activity ? new Date(activity).toISOString() : null,
    waiting,
  };
}
