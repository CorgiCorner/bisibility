import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import type { RunSelectionSpec } from "@/lib/rank-check/runs/selection";

/** Whole-market membership is resolved on the server, independently of table filters and pages. */
export function marketManualRunSelection(canonicalKey: string): RunSelectionSpec {
  if (!canonicalKey.trim()) throw new Error("A market is required.");
  return {
    kind: "filter",
    query: {
      ...defaultRankTrackerQueryState,
      lens: { device: "all", locationId: canonicalKey },
      sort: { direction: "asc", field: "keyword" },
    },
    v: 1,
  };
}
