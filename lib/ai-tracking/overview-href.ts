import { type OverviewFilters, overviewSearchParams } from "./overview-model";

const OVERVIEW_QUERY_KEYS = ["engine", "market", "prompts", "range", "tab", "topic"] as const;

/** Replaces the overview filters and keeps every unrelated query parameter. */
export function overviewFilterHref(
  pathname: string,
  current: URLSearchParams,
  filters: OverviewFilters,
  tab: "overview" | "sources" = "overview",
) {
  const params = new URLSearchParams(current);
  for (const key of OVERVIEW_QUERY_KEYS) params.delete(key);
  for (const [key, value] of overviewSearchParams(filters, tab)) params.set(key, value);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** The overview insight is about answers that do not name the brand. */
export function aiVisibilitySourcesInsightHref(
  pathname: string,
  current: URLSearchParams,
  filters: OverviewFilters,
) {
  return overviewFilterHref(pathname, current, { ...filters, promptKind: "unbranded" }, "sources");
}
