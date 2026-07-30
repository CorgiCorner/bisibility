import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { KeywordRow } from "@/lib/queries/keywords";
import { describe, expect, it } from "vitest";
import { effectiveRowDepth, selectionDepthLabel } from "./run-check-depth";

const row = keywordRows[0] as KeywordRow;

describe("run check depth", () => {
  it("uses the keyword schedule before the project default", () => {
    expect(
      effectiveRowDepth({
        ...row,
        projectSerpDepth: 50,
        schedule: { ...row.schedule, serp_depth: 20 },
      }),
    ).toBe(20);
  });

  it("falls back to the project default and then the product default", () => {
    expect(effectiveRowDepth({ ...row, projectSerpDepth: 50 })).toBe(50);
    expect(effectiveRowDepth(row)).toBe(100);
  });

  it("labels uniform and mixed selections", () => {
    expect(selectionDepthLabel([row, { ...row, id: "kw_2" }])).toBe("Top 100");
    expect(selectionDepthLabel([row, { ...row, id: "kw_2", projectSerpDepth: 50 }])).toBe(
      "keyword defaults",
    );
  });
});
