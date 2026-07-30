import type { KeywordFilterChip } from "@/lib/keywords/keyword-filter-model";
import type { KeywordRow } from "@/lib/queries/keywords";

export type KeywordExportMode = "all" | "filtered" | "selected";

export type KeywordExportTarget = {
  count: number;
  keywordIds?: string[];
  mode: KeywordExportMode;
};

type KeywordExportTargetInput = {
  filterChips: KeywordFilterChip[];
  filteredRows: KeywordRow[];
  rows: KeywordRow[];
  searchValue: string;
  selectedIds: string[];
};

export function keywordExportTarget({
  filterChips,
  filteredRows,
  rows,
  searchValue,
  selectedIds,
}: KeywordExportTargetInput): KeywordExportTarget {
  if (selectedIds.length > 0) {
    return { count: selectedIds.length, keywordIds: selectedIds, mode: "selected" };
  }
  if (searchValue.trim() || filterChips.length > 0) {
    return {
      count: filteredRows.length,
      keywordIds: filteredRows.map((row) => row.id),
      mode: "filtered",
    };
  }
  return { count: rows.length, mode: "all" };
}

function keywordLabel(count: number) {
  return count === 1 ? "keyword" : "keywords";
}

export function keywordExportTargetLabel(target: KeywordExportTarget) {
  if (target.mode === "all") return "Export all keywords";
  return `Export ${target.count} ${target.mode} ${keywordLabel(target.count)}`;
}
