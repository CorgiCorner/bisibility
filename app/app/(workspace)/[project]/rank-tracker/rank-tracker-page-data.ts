import {
  type MarketGridGroupRow,
  marketGridDefaultsToGrouped,
} from "@/lib/keywords/market-grid-model";
import {
  type NextSearchParams,
  parseRankTrackerQuery,
  type RankTrackerQueryState,
  resolveRankTrackerQuery,
} from "@/lib/keywords/rank-tracker-query";
import type {
  RankTrackerGroupedListResult,
  RankTrackerListResult,
} from "@/lib/keywords/rank-tracker-query-types";
import type { KeywordSavedView } from "@/lib/keywords/saved-view-model";
import { getRankTrackerGroupedList } from "@/lib/queries/rank-tracker-grouped-list";
import { getRankTrackerKeywordList } from "@/lib/queries/rank-tracker-list";
import { getSavedView } from "@/lib/queries/saved-views";

export type RankTrackerPageList =
  | (RankTrackerListResult & {
      mode: "flat-server";
      query: RankTrackerQueryState;
    })
  | (RankTrackerGroupedListResult & {
      groups: MarketGridGroupRow[];
      mode: "grouped-server";
      query: RankTrackerQueryState;
    });

export async function resolveRankTrackerPageQuery(projectRef: string, params: NextSearchParams) {
  const parsed = parseRankTrackerQuery(params);
  const requestedView = await getSavedView(projectRef, parsed.state.savedViewId);
  const query = resolveRankTrackerQuery(parsed, requestedView?.config);
  return {
    activeView: requestedView,
    groupedWasSpecified: parsed.present.has("grouped"),
    query: requestedView ? query : { ...query, savedViewId: null },
    malformedDevice: parsed.present.has("device") && parsed.issues.includes("device"),
    staleView: parsed.state.savedViewId !== null && requestedView === null,
  } satisfies {
    activeView: KeywordSavedView | null;
    groupedWasSpecified: boolean;
    malformedDevice: boolean;
    query: RankTrackerQueryState;
    staleView: boolean;
  };
}

export async function loadRankTrackerPageList(
  projectRef: string,
  query: RankTrackerQueryState,
  groupedWasSpecified: boolean,
): Promise<RankTrackerPageList> {
  if (query.grouped) {
    const result = await getRankTrackerGroupedList({ projectRef, query });
    return {
      ...result,
      mode: "grouped-server",
      query: { ...query, lens: result.resolvedLens },
    };
  }
  const flat = await getRankTrackerKeywordList({ projectRef, query });
  const flatQuery = { ...query, lens: flat.resolvedLens };
  if (!groupedWasSpecified && marketGridDefaultsToGrouped(flat.locations)) {
    const groupedQuery = { ...flatQuery, grouped: true };
    const result = await getRankTrackerGroupedList({ projectRef, query: groupedQuery });
    return {
      ...result,
      mode: "grouped-server",
      query: { ...groupedQuery, lens: result.resolvedLens },
    };
  }
  return {
    ...flat,
    mode: "flat-server",
    query: flatQuery,
  };
}
