import {
  type NextSearchParams,
  parseRankTrackerQuery,
  type RankTrackerQueryState,
  resolveRankTrackerQuery,
} from "@/lib/keywords/rank-tracker-query";
import type { RankTrackerListResult } from "@/lib/keywords/rank-tracker-query-types";
import type { KeywordSavedView } from "@/lib/keywords/saved-view-model";
import { getKeywordCount, getKeywordRows, KEYWORD_LIST_MAX } from "@/lib/queries/keywords";
import { getRankTrackerKeywordList } from "@/lib/queries/rank-tracker-list";
import { getSavedView } from "@/lib/queries/saved-views";

export type RankTrackerPageList =
  | (RankTrackerListResult & {
      mode: "flat-server";
      query: RankTrackerQueryState;
      totalKeywordCount?: never;
    })
  | {
      mode: "grouped-client";
      query: RankTrackerQueryState;
      rows: Awaited<ReturnType<typeof getKeywordRows>>;
      totalCount: number;
      totalKeywordCount?: number;
    };

export async function resolveRankTrackerPageQuery(projectRef: string, params: NextSearchParams) {
  const parsed = parseRankTrackerQuery(params);
  const requestedView = await getSavedView(projectRef, parsed.state.savedViewId);
  const query = resolveRankTrackerQuery(parsed, requestedView?.config);
  return {
    activeView: requestedView,
    query: requestedView ? query : { ...query, savedViewId: null },
    malformedDevice: parsed.present.has("device") && parsed.issues.includes("device"),
    staleView: parsed.state.savedViewId !== null && requestedView === null,
  } satisfies {
    activeView: KeywordSavedView | null;
    malformedDevice: boolean;
    query: RankTrackerQueryState;
    staleView: boolean;
  };
}

export async function loadRankTrackerPageList(
  projectRef: string,
  query: RankTrackerQueryState,
): Promise<RankTrackerPageList> {
  if (!query.grouped) {
    const result = await getRankTrackerKeywordList({ projectRef, query });
    return { ...result, mode: "flat-server", query: { ...query, lens: result.resolvedLens } };
  }
  const rows = await getKeywordRows(projectRef);
  const totalKeywordCount =
    rows.length >= KEYWORD_LIST_MAX ? await getKeywordCount(projectRef) : undefined;
  return {
    mode: "grouped-client",
    query,
    rows,
    totalCount: totalKeywordCount ?? rows.length,
    totalKeywordCount,
  };
}
