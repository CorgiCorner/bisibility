import { emptyKeywordFilters, type KeywordFilters } from "@/lib/keywords/keyword-filter-model";
import {
  type NextSearchParams,
  parseRankTrackerQuery,
  type RankTrackerQueryState,
  serializeRankTrackerQuery,
} from "./rank-tracker-query";
import type {
  RankTrackerQueryState as QueryState,
  RankTrackerQueryField,
} from "./rank-tracker-query-types";
import { RANK_TRACKER_SORT_FIELDS } from "./rank-tracker-query-types";

const ORTHOGONAL_PARAMS = ["tab", "add", "action"] as const;
export const RANK_TRACKER_FILTER_FIELDS = Object.keys(emptyKeywordFilters) as Array<
  keyof KeywordFilters
>;

function searchRecord(params: URLSearchParams): NextSearchParams {
  const record: NextSearchParams = {};
  for (const [key, value] of params) {
    const current = record[key];
    record[key] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value];
  }
  return record;
}

function sameValue(left: unknown, right: unknown) {
  return Array.isArray(left) && Array.isArray(right)
    ? left.length === right.length && left.every((value, index) => value === right[index])
    : left === right;
}

export function rankTrackerSortFromGrid(
  sort: { field?: string; sort?: string | null } | undefined,
): QueryState["sort"] {
  const valid = RANK_TRACKER_SORT_FIELDS.includes(sort?.field as QueryState["sort"]["field"]);
  const field = valid ? (sort?.field as QueryState["sort"]["field"]) : "position";
  return { direction: valid && sort?.sort === "desc" ? "desc" : "asc", field };
}

/** Derives URL-presence fields for a resolved-query mutation, including explicit defaults. */
export function rankTrackerMutationPresence(
  current: RankTrackerQueryState,
  next: RankTrackerQueryState,
  forced: readonly RankTrackerQueryField[] = [],
) {
  const present = new Set<RankTrackerQueryField>(forced);
  for (const field of RANK_TRACKER_FILTER_FIELDS) {
    if (!sameValue(current.filters[field], next.filters[field])) present.add(field);
  }
  if (current.search !== next.search) present.add("search");
  if (current.lens.device !== next.lens.device) present.add("device");
  if (current.lens.locationId !== next.lens.locationId) present.add("location");
  if (current.sort.field !== next.sort.field) present.add("sort");
  if (current.sort.direction !== next.sort.direction) present.add("direction");
  if (current.page !== next.page) present.add("page");
  if (current.pageSize !== next.pageSize) present.add("pageSize");
  if (current.grouped !== next.grouped) present.add("grouped");
  if (current.savedViewId !== next.savedViewId) present.add("savedViewId");
  return [...present];
}

export function filterFieldsForChip(key: string): Array<keyof KeywordFilters> {
  if (key === "volume") return ["volMin", "volMax"];
  if (key.startsWith("tag:")) return ["tags"];
  if (key.startsWith("topic:")) return ["topics"];
  if (key.startsWith("intent:")) return ["intents"];
  if (key.startsWith("serp:")) return ["serp"];
  return RANK_TRACKER_FILTER_FIELDS.includes(key as keyof KeywordFilters)
    ? [key as keyof KeywordFilters]
    : [];
}

export function rankTrackerNavigationHref({
  basePath,
  current,
  present = [],
  query,
}: {
  basePath: string;
  current: URLSearchParams;
  present?: readonly RankTrackerQueryField[];
  query: RankTrackerQueryState;
}) {
  const parsed = parseRankTrackerQuery(searchRecord(current));
  const queryParams = serializeRankTrackerQuery({
    issues: [],
    present: new Set([...parsed.present, ...present]),
    state: query,
  });
  for (const key of ORTHOGONAL_PARAMS) {
    const value = current.get(key);
    if (value !== null) queryParams.set(key, value);
  }
  const serialized = queryParams.toString();
  return serialized ? `${basePath}?${serialized}` : basePath;
}

export function resetRankTrackerPage(query: RankTrackerQueryState): RankTrackerQueryState {
  return { ...query, page: 1 };
}

export function patchRankTrackerFilters(
  query: RankTrackerQueryState,
  filters: KeywordFilters,
): RankTrackerQueryState {
  return resetRankTrackerPage({ ...query, filters });
}
