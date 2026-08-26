import { describe, expect, it } from "vitest";
import { keywordExportSelectionSchema } from "./keyword-export-contract";
import { defaultRankTrackerQueryState } from "./rank-tracker-query";

describe("keywordExportSelectionSchema", () => {
  it("rejects malformed, unsupported, and out-of-range queries", () => {
    expect(() =>
      keywordExportSelectionSchema.parse({
        mode: "query",
        query: { ...defaultRankTrackerQueryState, arbitrarySql: "DROP" },
      }),
    ).toThrow();
    expect(() =>
      keywordExportSelectionSchema.parse({
        mode: "query",
        query: { ...defaultRankTrackerQueryState, grouped: true },
      }),
    ).toThrow();
    expect(() =>
      keywordExportSelectionSchema.parse({
        mode: "query",
        query: { ...defaultRankTrackerQueryState, page: 10_001 },
      }),
    ).toThrow();
    expect(
      keywordExportSelectionSchema.parse({
        mode: "query",
        query: { ...defaultRankTrackerQueryState, page: 10_000 },
      }),
    ).toMatchObject({ mode: "query", query: { page: 10_000 } });
  });

  it("rejects ambiguous, duplicate, and oversized selected IDs", () => {
    expect(() =>
      keywordExportSelectionSchema.parse({
        keywordIds: [],
        mode: "all",
        query: defaultRankTrackerQueryState,
      }),
    ).toThrow();
    const unique = Array.from(
      { length: 500 },
      (_, index) => `kw_a${index.toString(36).padStart(23, "0")}`,
    );
    expect(
      keywordExportSelectionSchema.parse({ keywordIds: unique, mode: "selected" }),
    ).toMatchObject({ keywordIds: unique });
    expect(() =>
      keywordExportSelectionSchema.parse({
        keywordIds: [...unique, "kw_zzzzzzzzzzzzzzzzzzzzzzzz"],
        mode: "selected",
      }),
    ).toThrow();
    expect(() =>
      keywordExportSelectionSchema.parse({
        keywordIds: [unique[0], unique[0]],
        mode: "selected",
      }),
    ).toThrow("Selected keyword IDs must be unique.");
  });
});
