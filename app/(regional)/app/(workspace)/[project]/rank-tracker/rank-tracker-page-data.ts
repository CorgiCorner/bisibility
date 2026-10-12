import type { MarketGridGroupRow } from "@/lib/keywords/market-grid-model";
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
    query: requestedView ? query : { ...query, savedViewId: null },
    malformedDevice: parsed.present.has("device") && parsed.issues.includes("device"),
    explicitGrouping: parsed.present.has("grouped") && !parsed.issues.includes("grouped"),
    staleView: parsed.state.savedViewId !== null && requestedView === null,
  } satisfies {
    activeView: KeywordSavedView | null;
    malformedDevice: boolean;
    explicitGrouping: boolean;
    query: RankTrackerQueryState;
    staleView: boolean;
  };
}

export async function loadRankTrackerPageList(
  projectRef: string,
  query: RankTrackerQueryState,
  projectMarkets: readonly { id: string; status: "active" | "paused" }[],
  options: { explicitGrouping?: boolean } = {},
): Promise<RankTrackerPageList> {
  // The visible registry includes paused markets and excludes archived markets.
  const effectiveQuery = {
    ...query,
    grouped: options.explicitGrouping ? query.grouped : projectMarkets.length > 1,
  };
  if (effectiveQuery.grouped) {
    const result = await getRankTrackerGroupedList({ projectRef, query: effectiveQuery });
    return {
      ...result,
      mode: "grouped-server",
      query: { ...effectiveQuery, lens: result.resolvedLens },
    };
  }
  const flat = await getRankTrackerKeywordList({ projectRef, query: effectiveQuery });
  return {
    ...flat,
    mode: "flat-server",
    query: { ...effectiveQuery, lens: flat.resolvedLens },
  };
}
