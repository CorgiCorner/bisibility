import { addDays } from "@/lib/search-insights/dates";

export type DailyClickPoint = {
  clicks: number | null;
  dateKey: string;
};

const MAX_DAYS = 400;

/**
 * One point per finalized day in the window. A day with no stored row is a gap, not a zero,
 * and a row after the window end is ignored so unfinalized days never plot.
 */
export function buildDailyClickPoints(
  start: string,
  end: string,
  rows: readonly { clicks: number; dateKey: string }[],
): DailyClickPoint[] {
  if (!start || !end || start > end) return [];
  const byDay = new Map<string, number>();
  for (const row of rows) {
    if (row.dateKey < start || row.dateKey > end) continue;
    byDay.set(row.dateKey, row.clicks);
  }
  const points: DailyClickPoint[] = [];
  let cursor = start;
  while (cursor <= end && points.length < MAX_DAYS) {
    points.push({
      clicks: byDay.has(cursor) ? (byDay.get(cursor) ?? null) : null,
      dateKey: cursor,
    });
    const next = addDays(cursor, 1);
    if (next === cursor) break;
    cursor = next;
  }
  return points;
}

export function dailyClicksAreEmpty(points: readonly DailyClickPoint[]) {
  return points.length === 0 || points.every((point) => point.clicks === null);
}
