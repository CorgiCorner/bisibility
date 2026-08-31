import {
  FIRST_VIEW_ROW_BUFFER,
  FIRST_VIEW_ROWS,
  SEARCH_INSIGHTS_ROWS_CAP,
} from "@/lib/search-insights/constants";
import type {
  SearchInsightsPageRow,
  SearchInsightsQueryRow,
} from "@/lib/search-insights/queries/top-rows-model";
import type { KeyboardEvent } from "react";
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

export function tableRowKeys(open: () => void) {
  return (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    open();
  };
}

// One row of the module's table density, measured once so the windowed list can place rows it
// has not rendered. Rows carry the matching height class, so the constant is a fact rather
// than an estimate. The scroll region is the design's fixed height for the expanded state.
export const ROW_HEIGHT = 37;
export const ROW_HEIGHT_CLASS = "h-9.25";
export const SCROLL_REGION_HEIGHT = 520;
export const SCROLL_REGION_CLASS = "max-h-130";
export const WINDOW_OVERSCAN = 6;

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
 * The control walks 10 -> 50 -> all and then disappears; the head counter turns into the way
 * back. Every step reads rows that are already stored, so none of it costs a provider request.
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

export function footerNote(shown: number, total: number) {
  const rest = Math.max(0, total - shown);
  return `${rest.toLocaleString("en-US")} more stored, no provider cost`;
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
 * Which rows a scrolled list actually has to render. Only the band around the offset is put in
 * the DOM; the rest is accounted for by the padding above and below it, so the scrollbar still
 * describes the whole list.
 */
export function windowedRange(input: { count: number; height: number; scrollTop: number }) {
  const visible = Math.ceil(input.height / ROW_HEIGHT);
  const start = Math.max(0, Math.floor(input.scrollTop / ROW_HEIGHT) - WINDOW_OVERSCAN);
  const end = Math.min(input.count, start + visible + WINDOW_OVERSCAN * 2);
  return { end, start };
}

export function windowedPadding(range: { end: number; start: number }, count: number) {
  return { bottom: Math.max(0, count - range.end) * ROW_HEIGHT, top: range.start * ROW_HEIGHT };
}
