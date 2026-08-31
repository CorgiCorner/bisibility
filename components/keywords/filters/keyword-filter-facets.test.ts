import type { KeywordRow } from "@/lib/queries/keywords";
import { describe, expect, it } from "vitest";
import { getFilterFacets } from "./keyword-filter-facets";

function row(tags: string[]): KeywordRow {
  return { tags } as KeywordRow;
}

describe("keyword filter tag facets", () => {
  it("returns no tag facets when rows have no non-empty tags", () => {
    expect(getFilterFacets([row([]), row(["", "   "])]).tags).toEqual([]);
  });

  it("counts observed tags once per row in first-observed order", () => {
    expect(getFilterFacets([row(["Docs", "Product", "Docs"]), row(["Blog"])]).tags).toEqual([
      { count: 1, label: "Docs" },
      { count: 1, label: "Product" },
      { count: 1, label: "Blog" },
    ]);
  });

  it("counts tags repeated across rows", () => {
    expect(getFilterFacets([row(["Docs"]), row(["Product", "Docs"]), row(["Docs"])]).tags).toEqual([
      { count: 3, label: "Docs" },
      { count: 1, label: "Product" },
    ]);
  });
});
