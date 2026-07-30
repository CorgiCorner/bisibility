import { describe, expect, it } from "vitest";
import { groupResearchRows, normalizeResearchVariant } from "./grouping";
import type { KeywordResearchRow } from "./types";

function row(keyword: string, searchVolume: number | null): KeywordResearchRow {
  return {
    alreadySaved: false,
    alreadyTracked: false,
    competition: null,
    cpcCents: null,
    difficulty: null,
    intent: null,
    keyword,
    monthlyTrend: [],
    searchVolume,
    source: "related",
  };
}

describe("research keyword grouping", () => {
  it("normalizes case, punctuation, separators, and whitespace", () => {
    expect(normalizeResearchVariant("  Rank-Tracker_API, v1. ")).toBe("rank tracker api v1");
  });

  it("uses the highest-volume spelling and keeps grouped variants", () => {
    const grouped = groupResearchRows([
      row("rank-tracker", 120),
      row("rank tracker", 500),
      row("SEO tool", null),
    ]);

    expect(grouped.map((item) => item.keyword)).toEqual(["rank tracker", "SEO tool"]);
    expect(grouped[0]?.variants.map((item) => item.keyword)).toEqual([
      "rank tracker",
      "rank-tracker",
    ]);
  });
});
