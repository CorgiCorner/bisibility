import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultKeywordColumnVisibility, KEYWORD_DATA_TABLE_ID } from "./keyword-data-table-config";

describe("keyword data table configuration", () => {
  it("keeps the stable layout identifier and default columns", () => {
    expect(KEYWORD_DATA_TABLE_ID).toBe("rank-tracker-keywords");
    expect(defaultKeywordColumnVisibility).toEqual({
      change: true,
      difficulty: true,
      frequency: true,
      intent: true,
      lastChecked: true,
      location: true,
      sparkline: true,
      tags: true,
      targetRanking: true,
      topic: true,
      volume: true,
    });
  });

  it("uses the shared identifier and card frame in the keyword table", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/keywords/grid/KeywordDataTable.tsx"),
      "utf8",
    );

    expect(source).toContain("useDataTableLayout(KEYWORD_DATA_TABLE_ID)");
    expect(source).toContain("style={keywordTableCardStyle}");
    expect(source).toContain("borderRadius: UI_RADIUS_ROLES.card");
    expect(source).toContain('overflow: "hidden"');
  });
});

const typographySources = [
  "components/charts/TimeSeriesChart.tsx",
  "components/overview/PositionDistributionCard.tsx",
  "components/keywords/PositionHistoryAnnotations.tsx",
] as const;

describe("numeric typography source contract", () => {
  it.each(typographySources)("keeps tabular numerals separate from Sans in %s", (sourcePath) => {
    const source = readFileSync(resolve(process.cwd(), sourcePath), "utf8");

    const malformedFamily = `var(--font-sans ${"tabular-nums"})`;
    expect(source).not.toContain(malformedFamily);
    expect(source).toContain("var(--font-sans), system-ui, sans-serif");
    expect(source).toContain('fontVariantNumeric: "tabular-nums"');
  });
});
