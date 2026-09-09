import type { KeywordFilters } from "@/lib/keywords/keyword-filter-model";
import type { ActiveLens, LensLocationOption } from "@/lib/keywords/lens-model";
import type { MarketGridGroupRow } from "@/lib/keywords/market-grid-model";
import type { KeywordRow } from "@/lib/queries/keyword-row-types";

export const RANK_TRACKER_SORT_FIELDS = [
  "keyword",
  "device",
  "position",
  "change",
  "volume",
  "difficulty",
  "sparkline",
  "clicks",
  "impressions",
  "ctr",
  "lastChecked",
  "frequency",
  "location",
  "targetRanking",
  "tags",
  "topic",
  "intent",
] as const;
export const RANK_TRACKER_PAGE_SIZES = [25, 50, 100] as const;
export const RANK_TRACKER_MAX_PAGE = 10_000;

export type RankTrackerSortField = (typeof RANK_TRACKER_SORT_FIELDS)[number];
export type RankTrackerSortDirection = "asc" | "desc";
export type RankTrackerQueryField =
  | "search"
  | "location"
  | "device"
  | keyof KeywordFilters
  | "sort"
  | "direction"
  | "page"
  | "pageSize"
  | "grouped"
  | "savedViewId";

export type RankTrackerQueryState = {
  filters: KeywordFilters;
  grouped: boolean;
  lens: ActiveLens;
  page: number;
  pageSize: (typeof RANK_TRACKER_PAGE_SIZES)[number];
  savedViewId: string | null;
  search: string;
  sort: { direction: RankTrackerSortDirection; field: RankTrackerSortField };
};

export type RankTrackerQueryParseResult = {
  issues: string[];
  present: ReadonlySet<RankTrackerQueryField>;
  state: RankTrackerQueryState;
};

export type RankTrackerFacetValue = { count: number; label: string };
export type RankTrackerPositionFacet = RankTrackerFacetValue & {
  id: KeywordFilters["position"][number];
};
export type RankTrackerListFacets = {
  intents: RankTrackerFacetValue[];
  positions: RankTrackerPositionFacet[];
  tags: RankTrackerFacetValue[];
  topics: RankTrackerFacetValue[];
};
export type RankTrackerListQueryInput = { projectRef: string; query: RankTrackerQueryState };
export type RankTrackerListResult = {
  facets: RankTrackerListFacets;
  locations: LensLocationOption[];
  matchedTargetCount: number;
  page: number;
  pageCount: number;
  pageSize: RankTrackerQueryState["pageSize"];
  resolvedLens: ActiveLens;
  rows: KeywordRow[];
  totalCount: number;
};

export type RankTrackerGroupedListResult = Omit<RankTrackerListResult, "rows"> & {
  groups: MarketGridGroupRow[];
  matchedGroupCount: number;
};
