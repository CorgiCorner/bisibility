import type { GroupedResearchRow } from "./grouping";

export type DifficultyBucket = "easy" | "hard" | "medium";
export type ResearchFilters = {
  difficulty: DifficultyBucket[];
  hideTracked: boolean;
  intents: string[];
  minVolume: number;
  sources: string[];
};

export const emptyResearchFilters: ResearchFilters = {
  difficulty: [],
  hideTracked: false,
  intents: [],
  minVolume: 0,
  sources: [],
};

export function difficultyBucket(value: number | null): DifficultyBucket | null {
  if (value == null) return null;
  if (value <= 29) return "easy";
  if (value <= 69) return "medium";
  return "hard";
}

export function activeResearchFilterCount(filters: ResearchFilters) {
  return (
    filters.difficulty.length +
    filters.intents.length +
    filters.sources.length +
    (filters.minVolume > 0 ? 1 : 0) +
    (filters.hideTracked ? 1 : 0)
  );
}

export function applyResearchFilters(
  rows: readonly GroupedResearchRow[],
  filters: ResearchFilters,
) {
  return rows.filter((row) => {
    if (filters.hideTracked && row.alreadyTracked) return false;
    if ((row.searchVolume ?? 0) < filters.minVolume) return false;
    if (filters.sources.length > 0 && !filters.sources.includes(row.source)) return false;
    if (filters.intents.length > 0 && !filters.intents.includes(row.intent ?? "unknown")) {
      return false;
    }
    const bucket = difficultyBucket(row.difficulty);
    if (filters.difficulty.length > 0 && (!bucket || !filters.difficulty.includes(bucket))) {
      return false;
    }
    return true;
  });
}
