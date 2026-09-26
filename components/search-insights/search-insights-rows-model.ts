import { SEARCH_INSIGHTS_ROWS_CAP } from "@/lib/search-insights/constants";
import type {
  SearchInsightsPageRow,
  SearchInsightsQueryRow,
} from "@/lib/search-insights/queries/top-rows-model";
import {
  SEARCH_INSIGHTS_SORT_DEFAULT_DIRECTION,
  type SearchInsightsSort,
  type SearchInsightsSortKey,
} from "@/lib/search-insights/queries/top-rows-sort";

export type SearchInsightsRowKind = "pages" | "queries";

/** What one table asks the server for: a page of the rows that match the search, in one order. */
export type RowsQuery = {
  page: number;
  pageSize: number;
  search: string;
  sort: SearchInsightsSort;
};

export type RowsState<TRow> = RowsQuery & {
  rows: readonly TRow[];
  total: number;
};

export type QueryRowsState = RowsState<SearchInsightsQueryRow>;
export type PageRowsState = RowsState<SearchInsightsPageRow>;

export function rowsQuery({ page, pageSize, search, sort }: RowsQuery): RowsQuery {
  return { page, pageSize, search, sort };
}

export function rowsOffset({ page, pageSize }: Pick<RowsQuery, "page" | "pageSize">) {
  return (page - 1) * pageSize;
}

/**
 * How far the pages reach. A saturated window holds every distinct query Google named, which
 * runs to hundreds of thousands, and every page re-aggregates the window before it skips, so the
 * pages stop at the cap and the export carries the rest.
 */
export function rowsReach(total: number) {
  return Math.min(total, SEARCH_INSIGHTS_ROWS_CAP);
}

/**
 * Position colour is a rank-quality bucket, never a status colour: the accent stays reserved
 * for actions, so a weak position reads muted rather than alarming.
 */
export function positionClassName(position: number) {
  return position <= 10 ? "text-fg" : "text-fg-muted";
}

export function formatRowCtr(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    style: "percent",
  }).format(value);
}

export function formatRowPosition(value: number, locale: string) {
  return `#${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}`;
}

export function formatRowCount(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value));
}

/**
 * A header cycles between exactly three states: unsorted, then the column's own default direction,
 * then the other one. Re-clicking never returns to unsorted - the table is always ordered by
 * something, and "unsorted" is only what the other columns are.
 */
export function nextSort(current: SearchInsightsSort, key: SearchInsightsSortKey) {
  if (current.key !== key) {
    return { direction: SEARCH_INSIGHTS_SORT_DEFAULT_DIRECTION[key], key };
  }
  return { direction: current.direction === "asc" ? ("desc" as const) : ("asc" as const), key };
}
