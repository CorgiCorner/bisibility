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
import {
  COLLAPSE_LABEL,
  SHOW_CAP_TITLE,
  SHOW_MORE_LABEL,
  SHOW_MORE_TITLE,
  showCapLabel,
} from "./search-insights-copy";

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

export function counterLabel(shown: number, total: number) {
  return `${shown.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`;
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
export function reachLabel(shown: number, total: number, cap: number) {
  if (shown >= Math.min(total, cap)) return null;
  return total > cap ? showCapLabel(cap) : `Show all ${total.toLocaleString("en-US")}`;
}

/**
 * The control walks 10 -> 50 -> all and then disappears. Collapse is the way back.
 * Every step reads rows that are already stored, so none of it costs a provider request.
 */
export function moreLabel(show: RowsShow, total: number) {
  if (show === "all" || total <= FIRST_VIEW_ROWS) return null;
  if (show === FIRST_VIEW_ROWS) return SHOW_MORE_LABEL;
  return reachLabel(FIRST_VIEW_ROW_BUFFER, total, SEARCH_INSIGHTS_ROWS_CAP);
}

export function moreTitle(show: RowsShow, total: number) {
  const capped = show !== FIRST_VIEW_ROWS && total > SEARCH_INSIGHTS_ROWS_CAP;
  return capped ? SHOW_CAP_TITLE : SHOW_MORE_TITLE;
}

export function collapseLabel(show: RowsShow) {
  return show === FIRST_VIEW_ROWS ? null : COLLAPSE_LABEL;
}

/**
 * Position colour is a rank-quality bucket, never a status colour: the accent stays reserved
 * for actions, so a weak position reads muted rather than alarming.
 */
export function positionClassName(position: number) {
  return position <= 10 ? "text-fg" : "text-fg-muted";
}

export function formatRowCtr(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatRowPosition(value: number) {
  return `#${value.toFixed(1)}`;
}

export function formatRowCount(value: number) {
  return Math.round(value).toLocaleString("en-US");
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
