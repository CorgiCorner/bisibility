import { GSC_QUERY_STATS_PAGE_SIZE } from "@/lib/providers/analytics/gsc-query-pagination";

// Search type stored on every row. Web, Discover and News are never mixed.
export const SEARCH_INSIGHTS_SEARCH_TYPE = "web";

// How far back the provider still serves data; everything older survives only in stored rows.
export const RETENTION_MONTHS = 16;

// The opportunity band is labeled numerically, never with vendor jargon.
export const POSITION_BAND = { max: 20, min: 4 } as const;

export function positionBandLabel() {
  return `positions ${POSITION_BAND.min}-${POSITION_BAND.max}`;
}

// A query with a handful of clicks, or a page holding one, is noise in the overlap count.
export const MIN_QUERY_CLICKS = 8;
// Minimum window impressions before a query joins the position band. Position alone says
// nothing about demand, and a query nobody searched for is not an opportunity.
export const MIN_BAND_IMPRESSIONS = 50;
export const MIN_PAGE_CLICKS = 3;
// Overlap candidates need meaningful volume relative to the busiest query in the window; the
// floor itself is computed in the selection that uses it, so there is one derivation of it.
export const OVERLAP_FLOOR_SHARE = 0.22;

export type WindowPresetId = "1" | "7" | "28" | "90";
export type SearchInsightsComparisonMode = "previous_period" | "year_over_year";

export type WindowPreset = {
  days: number;
  disabled?: boolean;
  id: WindowPresetId;
  label: string;
};

// Presets only, no custom calendar: every comparison stays symmetric and finalized-only.
export const WINDOW_PRESETS = [
  { days: 7, id: "7", label: "7 finalized days" },
  { days: 28, id: "28", label: "28 finalized days" },
  { days: 90, id: "90", label: "90 finalized days" },
] as const satisfies readonly WindowPreset[];

export const DEFAULT_COMPARISON_MODE = "previous_period" satisfies SearchInsightsComparisonMode;

export const YEAR_OVER_YEAR_COMPARISON = {
  label: "Compare with same period last year",
  mode: "year_over_year",
  query: "yoy",
} as const satisfies {
  label: string;
  mode: SearchInsightsComparisonMode;
  query: string;
};

// A state the module enters on its own while the first week finalizes, never a menu choice:
// WINDOW_PRESETS stays 7 / 28 / 90 and resolvePeriod never resolves "1" from a request.
export const FIRST_LOOK_WINDOW = {
  days: 1,
  id: "1",
  label: "1 finalized day",
} as const satisfies WindowPreset;

export const YOY_MIN_HISTORY_MONTHS = 13;

export const DEFAULT_WINDOW_ID: WindowPresetId = "28";

export const SYNC_NOW_COOLDOWN_MS = 5 * 60 * 1_000;

// The first view renders ten rows, holds fifty, and pages the rest in on request. One page of
// the paged reads is capped so a single click can never materialize a saturated window.
export const FIRST_VIEW_ROWS = 10;
export const FIRST_VIEW_ROW_BUFFER = 50;
export const ROWS_PAGE_LIMIT = 1_000;

// One definition of the page size: the request layer already owns it.
export const SEARCH_ANALYTICS_ROW_LIMIT = GSC_QUERY_STATS_PAGE_SIZE;

// Provider ceiling on dimensional rows per day, per property, per search type.
export const DAILY_ROW_CEILING = 50_000;

// A saturated property stores tens of thousands of queries a day, so the export takes the busiest
// queries of the window rather than letting one click build the whole history in memory.
export const SEARCH_INSIGHTS_EXPORT_ROW_CAP = 50_000;

// The same ceiling for the tables, an order of magnitude tighter: every row a table expands to is
// paged over the wire and then held in the browser, so Show all reaches the busiest rows of the
// window and the export is what carries a saturated one.
export const SEARCH_INSIGHTS_ROWS_CAP = 5_000;

export type DataIncident = {
  from: string;
  id: string;
  label: string;
  to: string;
};

// Published provider anomalies that make a compared period unsafe to read at face value.
export const KNOWN_DATA_INCIDENTS = [
  {
    from: "2025-05-13",
    id: "impressions-2025-05",
    label: "Google reported an impressions data issue for this period.",
    to: "2026-04-27",
  },
] as const satisfies readonly DataIncident[];

// Date keys are ISO, so lexical comparison is calendar comparison.
export function incidentsOverlapping(start: string, end: string): readonly DataIncident[] {
  return KNOWN_DATA_INCIDENTS.filter((incident) => incident.from <= end && incident.to >= start);
}

// A drawer list opens complete at fifteen rows: truncating an eight item list buys nothing.
// Show all reaches the rest, and stops at the cap one click is allowed to materialize.
export const DRAWER_LIST_ROWS = 15;
export const DRAWER_LIST_CAP = 1_000;

// How many of a query's own pages an overlap row proves inline. The badge carries the count of
// the rest, and the query drawer behind the row carries the full split.
export const OVERLAP_SPLIT_ROWS = 2;
