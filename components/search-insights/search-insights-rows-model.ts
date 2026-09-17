import {
  FIRST_VIEW_ROW_BUFFER,
  FIRST_VIEW_ROWS,
  SEARCH_INSIGHTS_ROWS_CAP,
} from "@/lib/search-insights/constants";
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

/** Ten rows, then the fifty already loaded, then everything the window holds. */
export type RowsShow = "all" | number;

export type RowsState<TRow> = {
  rows: readonly TRow[];
  show: RowsShow;
  total: number;
};

export type QueryRowsState = RowsState<SearchInsightsQueryRow>;
export type PageRowsState = RowsState<SearchInsightsPageRow>;

export function nextShow(show: RowsShow): RowsShow {
  return show === FIRST_VIEW_ROWS ? FIRST_VIEW_ROW_BUFFER : "all";
}

export function visibleRows<TRow>(rows: readonly TRow[], show: RowsShow) {
  return show === "all" ? rows : rows.slice(0, show);
}

/**
 * How far the last step reaches. A saturated window holds every distinct query Google named,
 * which runs to hundreds of thousands: paging all of them in would be one request per thousand
 * rows and then the lot of them in the browser, so the table stops at the cap.
 */
export function rowsReach(total: number) {
  return Math.min(total, SEARCH_INSIGHTS_ROWS_CAP);
}

/**
 * The one rule every "show the rest" control follows, table or drawer. Past the cap the label
 * must not promise what it stops short of, and once the rows already reach the cap there is
 * nothing left to offer: a button that re-reads the same rows would never leave the screen.
 */
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
