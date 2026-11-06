import type { GscSearchAnalyticsEnvelope } from "@/lib/providers/analytics/gsc-search-analytics";
import { type WindowTotals, windowTotals } from "@/lib/search-insights/queries/kpis-model";
import { z } from "zod";
import {
  addDays,
  dateFromKey,
  dateKey,
  diffDays,
  type FinalizedWindow,
  finalizedWindow,
} from "./dates";

const calendarDate = z
  .string()
  .regex(/^[1-9]\d{3}-\d{2}-\d{2}$/)
  .refine((value) => {
    try {
      dateFromKey(value);
      return true;
    } catch {
      return false;
    }
  }, "Expected a real calendar date.");

export const performanceTotalsQuery = z
  .object({
    start_date: calendarDate,
    end_date: calendarDate,
    compare_previous: z.enum(["true", "false"]).default("false"),
  })
  .refine(
    ({ start_date, end_date }) => start_date <= end_date,
    "start_date must not be after end_date.",
  )
  .refine(({ start_date, end_date }) => {
    try {
      return diffDays(start_date, end_date) < 366;
    } catch {
      return false;
    }
  }, "A window may contain at most 366 days.");

export function performanceWindow(input: z.infer<typeof performanceTotalsQuery>) {
  return finalizedWindow(input.end_date, diffDays(input.start_date, input.end_date) + 1);
}

export type PerformancePeriod = WindowTotals & {
  start_date: string;
  end_date: string;
  data_start_date: string | null;
  data_end_date: string | null;
  freshness: {
    data_state: "all" | "final";
    fetched_at: string;
    finalized_through: string | null;
    first_incomplete_date: string | null;
  };
};

export type AggregateRange = { startDate: Date; endDate: Date; persistedAt: Date | null };

// Coverage is a union of successful persisted requests, including days with no rows.
export function aggregateCoverage(ranges: AggregateRange[], start: string, end: string) {
  let next = start;
  let fetchedAt = Number.POSITIVE_INFINITY;
  for (const range of [...ranges].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())) {
    if (!range.persistedAt || dateKey(range.endDate) < next) continue;
    if (dateKey(range.startDate) > next) return null;
    fetchedAt = Math.min(fetchedAt, range.persistedAt.getTime());
    if (dateKey(range.endDate) >= end) return new Date(fetchedAt);
    next = addDays(dateKey(range.endDate), 1);
  }
  return null;
}

export function livePerformancePeriods(
  envelope: GscSearchAnalyticsEnvelope,
  window: FinalizedWindow,
  comparePrevious: boolean,
  fetchedAt: Date,
): { current: PerformancePeriod; previous: PerformancePeriod | null } {
  const start = comparePrevious ? window.previous.start : window.current.start;
  const seen = new Set<string>();
  for (const row of envelope.rows) {
    const date = row.keys?.[0];
    if (
      row.keys.length !== 1 ||
      !calendarDate.safeParse(date).success ||
      date < start ||
      date > window.current.end ||
      seen.has(date) ||
      !Number.isInteger(row.clicks) ||
      !Number.isInteger(row.impressions) ||
      ![row.clicks, row.impressions, row.position].every((n) => Number.isFinite(n) && n >= 0)
    ) {
      throw new Error("Invalid search-performance date series.");
    }
    seen.add(date);
  }
  const incomplete = envelope.metadata?.firstIncompleteDate;
  if (incomplete && !calendarDate.safeParse(incomplete).success)
    throw new Error("Invalid search-performance freshness date.");
  const period = (dates: FinalizedWindow["current"]): PerformancePeriod => {
    const rows = envelope.rows.filter(
      (row) => row.keys[0] >= dates.start && row.keys[0] <= dates.end,
    );
    const keys = rows
      .filter((row) => row.impressions > 0)
      .map((row) => row.keys[0])
      .sort();
    const final = Boolean(incomplete && incomplete > dates.end);
    const finalizedThrough = incomplete
      ? final
        ? dates.end
        : incomplete > dates.start
          ? addDays(incomplete, -1)
          : null
      : null;
    return {
      ...windowTotals({
        clicks: rows.reduce((n, row) => n + row.clicks, 0),
        impressions: rows.reduce((n, row) => n + row.impressions, 0),
        positionWeight: rows.reduce((n, row) => n + row.position * row.impressions, 0),
      }),
      start_date: dates.start,
      end_date: dates.end,
      data_start_date: keys[0] ?? null,
      data_end_date: keys.at(-1) ?? null,
      freshness: {
        data_state: final ? "final" : "all",
        fetched_at: fetchedAt.toISOString(),
        finalized_through: finalizedThrough,
        first_incomplete_date:
          incomplete && incomplete <= dates.end && incomplete >= dates.start ? incomplete : null,
      },
    };
  };
  return {
    current: period(window.current),
    previous: comparePrevious ? period(window.previous) : null,
  };
}
