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

it("protects downloaded keyword and variant text, preserves numbers and original JSON", () => {
  const value = row({
    keyword: "\uFEFF=1+1",
    searchVolume: -3,
    variants: [{ ...row().variants[0], keyword: "\rvariant" }],
  });
  const before = structuredClone(value);
  expect(researchExportContent([value], "csv")).toBe(
    "keyword,volume,kd,cpc_usd,intent,source,tracked,variants\n'\uFEFF=1+1,-3,30,1.25,commercial,related,no,\"'\rvariant\"",
  );
  expect(JSON.parse(researchExportContent([value], "json"))[0]).toMatchObject({
    keyword: value.keyword,
    variants: ["\rvariant"],
    searchVolume: -3,
  });
  expect(value).toEqual(before);
});

it("retains fixed CPC precision for a numeric negative value without a text prefix", () => {
  expect(researchExportContent([row({ cpcCents: -300 })], "csv")).toContain(
    "seo tool,500,30,-3.00,commercial",
  );
});
