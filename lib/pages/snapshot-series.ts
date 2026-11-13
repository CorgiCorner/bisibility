import { calendarDay } from "@/lib/achievements/calendar";
import { completeSeriesEnd } from "@/lib/charts/complete-day";
import type { SnapshotMetricId, SnapshotSeriesPoint } from "./snapshot-view";

export const SNAPSHOT_SERIES_MAX_DAYS = 400;

const DAY_MS = 86_400_000;

export function utcDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function dateFromKey(key: string) {
  return new Date(`${key}T00:00:00.000Z`);
}

/** Inclusive UTC dates, never more than 400 days, keeping the newest days. */
export function snapshotSeriesWindow(from: Date, to: Date) {
  const end = dateFromKey(utcDateKey(to));
  let start = dateFromKey(utcDateKey(from));
  if (start.getTime() > end.getTime()) start = end;
  const span = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (span > SNAPSHOT_SERIES_MAX_DAYS) {
    start = new Date(end.getTime() - (SNAPSHOT_SERIES_MAX_DAYS - 1) * DAY_MS);
  }
  return { from: start, to: end };
}

export function sinceSnapshotWindow(
  takenOn: string,
  now: Date,
  span: "28" | "since",
  timeZone = "UTC",
) {
  const end = dateFromKey(
    completeSeriesEnd({ now, requestedEnd: calendarDay(now, timeZone), timeZone }),
  );
  const start = span === "28" ? new Date(end.getTime() - 27 * DAY_MS) : dateFromKey(takenOn);
  return snapshotSeriesWindow(start, end);
}

export function fillDailyMembership(
  from: Date,
  to: Date,
  rows: readonly SnapshotSeriesPoint[],
): SnapshotSeriesPoint[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const window = snapshotSeriesWindow(from, to);
  const filled: SnapshotSeriesPoint[] = [];
  for (let cursor = window.from.getTime(); cursor <= window.to.getTime(); cursor += DAY_MS) {
    const day = utcDateKey(new Date(cursor));
    const row = byDay.get(day);
    filled.push({
      day,
      existing: row?.existing ?? 0,
      fresh: row?.fresh ?? 0,
      removed: row?.removed ?? 0,
    });
  }
  return filled;
}

/** Running totals. Removed is the subset of pages that later left, counted through their last day. */
export function cumulativeMembership(rows: readonly SnapshotSeriesPoint[]): SnapshotSeriesPoint[] {
  let existing = 0;
  let fresh = 0;
  let removed = 0;
  return rows.map((row) => {
    existing += row.existing;
    fresh += row.fresh;
    removed += row.removed;
    return { day: row.day, existing, fresh, removed };
  });
}

export function shareFromNew(existing: number, fresh: number) {
  const total = existing + fresh;
  if (total <= 0) return 0;
  return Math.round((fresh / total) * 100);
}

export function selectSnapshotMetric(
  requested: SnapshotMetricId | undefined,
  options: readonly { disabledReason: string | null; id: SnapshotMetricId }[],
) {
  const enabled = options.filter((option) => option.disabledReason == null);
  if (requested && enabled.some((option) => option.id === requested)) return requested;
  return enabled[0]?.id ?? null;
}
