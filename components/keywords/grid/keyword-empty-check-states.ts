import type { KeywordCheckState, KeywordRow } from "@/lib/queries/keyword-row-types";
import { keywordRankView } from "./keyword-rank-quality-view";

export function emptyCheckStates(rows: readonly KeywordRow[]): KeywordCheckState[] {
  return rows.length > 0 && rows.every((row) => !row.hasRankData && !keywordRankView(row).lastKnown)
    ? rows.map(
        (row) =>
          row.checkState ??
          (row.lastCheckStatus === "failed" || row.lastCheckStatus === "running"
            ? row.lastCheckStatus
            : row.lastCheckStatus === "completed"
              ? "not_ranked"
              : "never_checked"),
      )
    : [];
}
