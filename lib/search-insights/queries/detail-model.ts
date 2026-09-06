import { DRAWER_LIST_CAP, DRAWER_LIST_ROWS } from "@/lib/search-insights/constants";
import { addDays, type DateWindow, dateKey, diffDays } from "@/lib/search-insights/dates";
import { pagePath } from "./top-rows-model";

export type SearchInsightsStats = {
  clicks: number;
  ctr: number;
  impressions: number;
  position: number;
};

/** One finalized day of the selected window. Every day of it has an entry, zero included. */
export type SearchInsightsDay = {
  clicks: number;
  date: string;
};

/**
 * A slice, never a total: the clicks on this query AND this page, and the position that pairing
 * held. The rows of a pivot can therefore never add up to more than the drawer's own header.
 */
export type SearchInsightsPageSlice = {
  clicks: number;
  engagementRate: number | null;
  keyEvents: number | null;
  path: string;
  position: number;
  url: string;
};

export type SearchInsightsQuerySlice = {
  clicks: number;
  position: number;
  query: string;
};

export type SearchInsightsList<TRow> = {
  rows: readonly TRow[];
  total: number;
};

export const EMPTY_STATS: SearchInsightsStats = {
  clicks: 0,
  ctr: 0,
  impressions: 0,
  position: 0,
};

export const EMPTY_LIST = { rows: [], total: 0 } as const;

type CountedRow = { total?: bigint | number };

type MetricRow = {
  clicks: bigint | number;
  impressions: bigint | number;
  positionWeight: number | null;
};

type DayRow = MetricRow & { date: Date | string };

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * The window totals, folded from the same day rows the bars are drawn from, so the headline and
 * the chart can never describe two different readings of the window.
 */
export function statsOf(rows: readonly MetricRow[]): SearchInsightsStats {
  let clicks = 0;
  let impressions = 0;
  let positionWeight = 0;
  for (const row of rows) {
    clicks += Number(row.clicks);
    impressions += Number(row.impressions);
    positionWeight += Number(row.positionWeight ?? 0);
  }
  return {
    clicks,
    ctr: ratio(clicks, impressions),
    impressions,
    position: ratio(positionWeight, impressions),
  };
}

function dayKey(value: Date | string) {
  return typeof value === "string" ? value.slice(0, 10) : dateKey(value);
}

/**
 * One entry per day of the window, in order. A day the provider reported nothing for is a real
 * zero rather than a gap: a bar chart that silently drops days would compress the window and
 * make a quiet week look like a busy one.
 */
export function perDaySeries(window: DateWindow, rows: readonly DayRow[]): SearchInsightsDay[] {
  const clicksByDay = new Map(rows.map((row) => [dayKey(row.date), Number(row.clicks)]));
  const days = diffDays(window.start, window.end) + 1;
  const series: SearchInsightsDay[] = [];
  for (let index = 0; index < days; index += 1) {
    const date = addDays(window.start, index);
    series.push({ clicks: clicksByDay.get(date) ?? 0, date });
  }
  return series;
}

export function pageSlices(
  rows: readonly (CountedRow & {
    clicks: bigint | number;
    engagementRate?: number | null;
    keyEvents?: number | null;
    page: string;
    position: number;
  })[],
): SearchInsightsList<SearchInsightsPageSlice> {
  return {
    rows: rows.map((row) => ({
      clicks: Number(row.clicks),
      engagementRate: row.engagementRate ?? null,
      keyEvents: row.keyEvents ?? null,
      path: pagePath(row.page),
      position: Number(row.position ?? 0),
      url: row.page,
    })),
    total: Number(rows.at(0)?.total ?? rows.length),
  };
}

export function querySlices(
  rows: readonly (CountedRow & { clicks: bigint | number; position: number; query: string })[],
): SearchInsightsList<SearchInsightsQuerySlice> {
  return {
    rows: rows.map((row) => ({
      clicks: Number(row.clicks),
      position: Number(row.position ?? 0),
      query: row.query,
    })),
    total: Number(rows.at(0)?.total ?? rows.length),
  };
}

/** The row count a list read is allowed to reach, whatever the caller asked for. */
export function drawerListLimit(limit?: number) {
  if (limit === undefined) return DRAWER_LIST_ROWS;
  return Math.max(1, Math.min(Math.floor(limit), DRAWER_LIST_CAP));
}
