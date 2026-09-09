import "server-only";

import type {
  RankTrackerListQueryInput,
  RankTrackerListResult,
} from "@/lib/keywords/rank-tracker-query-types";
import { loadKeywordRowsByInternalIds } from "./keyword-row-loader";
import type { KeywordRow } from "./keyword-row-types";
import { selectRankTrackerKeywords } from "./rank-tracker-selection";

export async function getRankTrackerKeywordList(
  input: RankTrackerListQueryInput,
): Promise<RankTrackerListResult> {
  if (input.query.grouped) throw new Error("Rank tracker list query supports flat mode only.");
  const {
    exactRows,
    project,
    raw,
    resolvedQuery: effectiveQuery,
  } = await selectRankTrackerKeywords(input.projectRef, input.query);
  let displayCount = raw.matchedTargetCount;
  let rows: KeywordRow[];
  if (exactRows) {
    displayCount = exactRows.length;
    const offset = (effectiveQuery.page - 1) * effectiveQuery.pageSize;
    rows = exactRows.slice(offset, offset + effectiveQuery.pageSize);
  } else {
    rows = await loadKeywordRowsByInternalIds(project, raw.keywordIds);
  }
  const pageCount = Math.ceil(displayCount / effectiveQuery.pageSize);
  const canonicalPage = pageCount === 0 ? 1 : Math.min(input.query.page, pageCount);
  return {
    facets: raw.facets,
    locations: raw.locations,
    matchedTargetCount: displayCount,
    page: canonicalPage,
    pageCount,
    pageSize: input.query.pageSize,
    resolvedLens: effectiveQuery.lens,
    rows,
    totalCount: raw.totalCount,
  };
}
