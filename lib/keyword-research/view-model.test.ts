import { describe, expect, it } from "vitest";
import type { GroupedResearchRow } from "./grouping";
import {
  activeResearchFilterCount,
  applyResearchFilters,
  difficultyBucket,
  emptyResearchFilters,
} from "./view-model";

function row(overrides: Partial<GroupedResearchRow> = {}): GroupedResearchRow {
  const value = {
    alreadySaved: false,
    alreadyTracked: false,
    competition: null,
    cpcCents: null,
    difficulty: 20,
    intent: "commercial" as const,
    keyword: "rank tracker",
    monthlyTrend: [],
    searchVolume: 500,
    source: "related" as const,
    ...overrides,
  };
  return { ...value, variants: [value] };
}

describe("keyword research view model", () => {
  it("maps difficulty values to shared buckets", () => {
    expect([difficultyBucket(20), difficultyBucket(50), difficultyBucket(90)]).toEqual([
      "easy",
      "medium",
      "hard",
    ]);
  });

  it("applies independent research facets and counts active filters", () => {
    const filters = {
      ...emptyResearchFilters,
      difficulty: ["easy" as const],
      hideTracked: true,
      intents: ["commercial"],
      minVolume: 100,
      sources: ["related"],
    };
    expect(activeResearchFilterCount(filters)).toBe(5);
    expect(
      applyResearchFilters([row(), row({ alreadyTracked: true, keyword: "tracked" })], filters),
    ).toHaveLength(1);
  });
});
