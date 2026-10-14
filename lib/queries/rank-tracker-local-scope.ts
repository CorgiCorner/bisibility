import type { LocalReadFilters } from "@/lib/dashboard-local/model";
import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import { rankTrackerScope } from "@/lib/keywords/rank-tracker-report-scope";

/** The URL/personal query is canonical; location keys are not database location IDs. */
export function rankTrackerLocalFilters(query: RankTrackerQueryState): LocalReadFilters {
  const days = rankTrackerScope(query).comparisonDays;
  return {
    device: query.lens.device,
    marketIds: [],
    canonicalLocationKey: query.lens.locationId,
    range: days === 7 ? "7d" : days === 28 ? "28d" : "90d",
    // Multiple tag filters retain the table's all-tags semantics in the shared projection.
    tag: null,
  };
}
