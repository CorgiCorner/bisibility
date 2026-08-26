import type { KeywordExportSelection } from "@/lib/keywords/keyword-export-contract";
import type { KeywordFilterChip } from "@/lib/keywords/keyword-filter-model";
import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import type { KeywordRow } from "@/lib/queries/keywords";

export type KeywordExportTarget = { count: number; selection: KeywordExportSelection };

type KeywordExportTargetInput = {
  filterChips: KeywordFilterChip[];
  filteredRows: KeywordRow[];
  flatServerQuery?: RankTrackerQueryState;
  matchedTargetCount?: number;
  rows: KeywordRow[];
  searchValue: string;
  selectedIds: string[];
};

export function keywordExportTarget(input: KeywordExportTargetInput): KeywordExportTarget {
  if (input.selectedIds.length > 0) {
    return {
      count: input.selectedIds.length,
      selection: { keywordIds: input.selectedIds, mode: "selected" },
    };
  }
  const filtered = Boolean(input.searchValue.trim() || input.filterChips.length > 0);
  const queryScoped = Boolean(
    input.flatServerQuery &&
      (filtered ||
        input.flatServerQuery.savedViewId ||
        input.flatServerQuery.lens.locationId ||
        input.flatServerQuery.lens.device !== "all"),
  );
  if (input.flatServerQuery && queryScoped) {
    return {
      count: input.matchedTargetCount ?? input.filteredRows.length,
      selection: {
        mode: "query",
        query: { ...input.flatServerQuery, grouped: false, search: input.searchValue },
      },
    };
  }
  if (filtered) {
    return {
      count: input.filteredRows.length,
      selection: { keywordIds: input.filteredRows.map((row) => row.id), mode: "selected" },
    };
  }
  return { count: input.rows.length, selection: { mode: "all" } };
}

function keywordLabel(count: number) {
  return count === 1 ? "keyword" : "keywords";
}

export function keywordExportTargetLabel(target: KeywordExportTarget) {
  if (target.selection.mode === "all") return "Export all keywords";
  const mode = target.selection.mode === "query" ? "filtered" : "selected";
  return `Export ${target.count} ${mode} ${keywordLabel(target.count)}`;
}
