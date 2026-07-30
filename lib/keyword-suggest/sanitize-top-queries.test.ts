import { describe, expect, it } from "vitest";
import { cleanTopQuery, sanitizeTopQueries } from "./sanitize-top-queries";

// Exact garbage classes observed in bisibility.com's own Search Console export.
const OPERATOR_QUERIES = [
  "-site:x.com",
  "site:",
  '"ai visibility tool" -site:reddit.com -site:example.com',
  "intitle:keyword tracker",
  "inurl:pricing",
  "filetype:pdf keyword report",
  "seo OR sem tools",
];
const HEADER_JUNK =
  "# keyword tags position previous position volume traffic (desc) impressions clicks";
const ROW_NUMBER_DUPES = ["13956: keyword tracking api", "556: keyword tracking api"];
const OVERLY_LONG = `a ${"keyword ".repeat(30)}tracker`; // > 100 chars
const QUOTED = ['"keyword tracking"', "'rank tracker'"];
const CLEAN = ["ai visibility tool", "rank tracking software"];

describe("cleanTopQuery", () => {
  it("drops queries containing search operators", () => {
    for (const query of OPERATOR_QUERIES) {
      expect(cleanTopQuery(query)).toBeNull();
    }
  });

  it("drops header-junk lines starting with #", () => {
    expect(cleanTopQuery(HEADER_JUNK)).toBeNull();
  });

  it("strips row-number prefixes", () => {
    expect(cleanTopQuery("13956: keyword tracking api")).toBe("keyword tracking api");
    expect(cleanTopQuery("556: keyword tracking api")).toBe("keyword tracking api");
  });

  it("strips surrounding quotes and collapses whitespace", () => {
    expect(cleanTopQuery('"keyword tracking"')).toBe("keyword tracking");
    expect(cleanTopQuery("'rank tracker'")).toBe("rank tracker");
    expect(cleanTopQuery("  keyword    tracking  ")).toBe("keyword tracking");
  });

  it("drops overly long queries", () => {
    expect(cleanTopQuery(OVERLY_LONG)).toBeNull();
  });

  it("keeps clean queries unchanged", () => {
    expect(cleanTopQuery("ai visibility tool")).toBe("ai visibility tool");
  });
});

const rowsOf = (queries: readonly string[]) => queries.map((query) => ({ query }));

describe("sanitizeTopQueries", () => {
  it("filters garbage, dedupes row-number variants, and counts hidden low-quality rows", () => {
    const rows = rowsOf([
      ...OPERATOR_QUERIES, // 7 hidden (operators)
      HEADER_JUNK, // 1 hidden (header)
      OVERLY_LONG, // 1 hidden (too long)
      ...ROW_NUMBER_DUPES, // 1 kept ("keyword tracking api"), 1 silent dupe
      ...QUOTED, // 2 kept
      ...CLEAN, // 2 kept
    ]);

    const result = sanitizeTopQueries(rows, 50);

    expect(result.suggestions.map((s) => s.query)).toEqual([
      "keyword tracking api",
      "keyword tracking",
      "rank tracker",
      "ai visibility tool",
      "rank tracking software",
    ]);
    // 7 operators + 1 header + 1 overly long = 9 hidden; the row-number dupe is not counted.
    expect(result.hiddenCount).toBe(9);
  });

  it("preserves per-row metrics on the cleaned suggestion", () => {
    const result = sanitizeTopQueries(
      [{ query: "13956: rank tracker", clicks: 42, impressions: 900 }],
      50,
    );

    expect(result.suggestions).toEqual([{ query: "rank tracker", clicks: 42, impressions: 900 }]);
  });

  it("respects the limit while preserving source order", () => {
    const result = sanitizeTopQueries(rowsOf(["one", "two", "three", "four"]), 2);

    expect(result.suggestions.map((s) => s.query)).toEqual(["one", "two"]);
    expect(result.hiddenCount).toBe(0);
  });

  it("dedupes case-insensitively without counting dupes as hidden", () => {
    const result = sanitizeTopQueries(rowsOf(["Rank Tracker", "rank tracker", "RANK TRACKER"]), 50);

    expect(result.suggestions.map((s) => s.query)).toEqual(["Rank Tracker"]);
    expect(result.hiddenCount).toBe(0);
  });
});
