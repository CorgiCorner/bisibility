import { describe, expect, it } from "vitest";
import { keywordNoRowsCopy } from "./keyword-scope-summary";

const options = [
  { count: 2, displayName: "Austin, Texas", id: "loc_austin", kind: "city" as const },
];

describe("keywordNoRowsCopy", () => {
  it("names the active scope and filter count", () => {
    expect(
      keywordNoRowsCopy({
        filterCount: 2,
        hasSearch: false,
        lens: { device: "desktop", locationId: "loc_austin" },
        needsRankData: false,
        options,
      }),
    ).toEqual({
      description: "Adjust the active filters or show keywords from all locations and devices.",
      title: "No keywords match Austin, Texas / Desktop with 2 active filters",
    });
  });

  it("explains filters that need a first rank check", () => {
    expect(
      keywordNoRowsCopy({
        filterCount: 2,
        hasSearch: false,
        lens: { device: "desktop", locationId: null },
        needsRankData: true,
        options,
      }),
    ).toEqual({
      description:
        "Some active filters need ranking data. Remove the ranking filters to see keywords awaiting their first check.",
      title: "No keywords match Desktop with 2 active filters",
    });
  });
});
