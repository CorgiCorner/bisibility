/**
 * Sorting is a property of the read, never of the loaded page: the tables page through a window
 * with LIMIT/OFFSET, so a client-side reorder would sort the rows already on screen and leave the
 * rest of the window contradicting the counter above it. This file stays free of database imports
 * because its types and defaults also describe the client-side controls.
 */
export const SEARCH_INSIGHTS_SORT_KEYS = [
  "clicks",
  "ctr",
  "impressions",
  "position",
  "text",
] as const;

export type SearchInsightsSortKey = (typeof SEARCH_INSIGHTS_SORT_KEYS)[number];
export type SearchInsightsSortDirection = "asc" | "desc";
export type SearchInsightsSort = {
  direction: SearchInsightsSortDirection;
  key: SearchInsightsSortKey;
};

/** Biggest first is what a metric column is read for; a text column reads A to Z. */
export const SEARCH_INSIGHTS_SORT_DEFAULT_DIRECTION: Record<
  SearchInsightsSortKey,
  SearchInsightsSortDirection
> = {
  clicks: "desc",
  ctr: "desc",
  impressions: "desc",
  position: "asc",
  text: "asc",
};

export const SEARCH_INSIGHTS_DEFAULT_SORT: SearchInsightsSort = {
  direction: "desc",
  key: "clicks",
};

export function isSearchInsightsSortKey(value: unknown): value is SearchInsightsSortKey {
  return (
    typeof value === "string" && (SEARCH_INSIGHTS_SORT_KEYS as readonly string[]).includes(value)
  );
}
