type Sort = { direction: "asc" | "desc"; field: string };

import type { SavedKeywordRow } from "./model";

const valueFor: Record<string, (row: SavedKeywordRow) => string | number | null> = {
  keyword: (row) => row.text,
  volume: (row) => row.volume,
  difficulty: (row) => row.difficulty,
  cpc: (row) => row.cpc,
  intent: (row) => row.intent,
  source: (row) => row.sourceSeed,
  savedAt: (row) => row.savedAt,
};

export function sortSavedKeywords(rows: readonly SavedKeywordRow[], sorting: Sort | null) {
  const value = sorting && valueFor[sorting.field];
  if (!sorting || !value) return [...rows];
  return [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left == null || right == null) return left === right ? 0 : left == null ? 1 : -1;
    const comparison =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), undefined, { sensitivity: "base" });
    return (
      (sorting.direction === "asc" ? comparison : -comparison) ||
      a.publicId.localeCompare(b.publicId)
    );
  });
}
