import type { GroupedResearchRow } from "@/lib/keyword-research/grouping";
import { describe, expect, it } from "vitest";
import { researchExportContent } from "./research-results-view";

function row(overrides: Partial<GroupedResearchRow> = {}): GroupedResearchRow {
  const value = {
    alreadySaved: false,
    alreadyTracked: false,
    competition: 0.4,
    cpcCents: 125,
    difficulty: 30,
    intent: "commercial" as const,
    keyword: "seo tool",
    monthlyTrend: [],
    searchVolume: 500,
    source: "related" as const,
  };
  return { ...value, variants: [value], ...overrides };
}

describe("researchExportContent", () => {
  it("builds CSV with escaped fields and dollar CPC", () => {
    const csv = researchExportContent(
      [row({ keyword: 'best "seo", tools' }), row({ cpcCents: null, keyword: "plain" })],
      "csv",
    );
    const [header, first, second] = csv.split("\n");
    expect(header).toBe("keyword,volume,kd,cpc_usd,intent,source,tracked,variants");
    expect(first).toContain('"best ""seo"", tools",500,30,1.25,commercial,related,no');
    expect(second).toContain("plain,500,30,,commercial,related,no");
  });

  it("builds JSON with grouped variant keywords", () => {
    const parsed = JSON.parse(researchExportContent([row()], "json"));
    expect(parsed).toEqual([
      {
        cpcCents: 125,
        difficulty: 30,
        intent: "commercial",
        keyword: "seo tool",
        searchVolume: 500,
        source: "related",
        tracked: false,
        variants: ["seo tool"],
      },
    ]);
  });
});
