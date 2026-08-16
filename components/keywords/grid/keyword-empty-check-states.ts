import type { KeywordCheckState, KeywordRow } from "@/lib/queries/keyword-row-types";

export function emptyCheckStates(rows: readonly KeywordRow[]): KeywordCheckState[] {
  return rows.every((row) => !row.hasRankData)
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
