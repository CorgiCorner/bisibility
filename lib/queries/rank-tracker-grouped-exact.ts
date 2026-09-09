import {
  aggregateMarketGridRows,
  compareMarketGridAggregates,
  groupRow,
  type MarketGridGroupRow,
  type MarketGridTarget,
} from "@/lib/keywords/market-grid-model";
import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import { filterExactRankTrackerRows } from "./rank-tracker-list-exact";

export function exactRankTrackerGroupedRows(
  rows: readonly MarketGridTarget[],
  query: RankTrackerQueryState,
) {
  const matching = filterExactRankTrackerRows([...rows], query) as MarketGridTarget[];
  const aggregates = aggregateMarketGridRows(matching);
  aggregates.sort((left, right) => compareMarketGridAggregates(left, right, query.sort));
  return {
    groups: aggregates.map((aggregate) => groupRow(aggregate, aggregate.children)),
    matchedGroupCount: aggregates.length,
    matchedTargetCount: matching.length,
  } satisfies {
    groups: MarketGridGroupRow[];
    matchedGroupCount: number;
    matchedTargetCount: number;
  };
}
