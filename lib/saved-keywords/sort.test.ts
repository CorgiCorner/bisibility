import { describe, expect, it } from "vitest";
import type { SavedKeywordRow } from "./model";
import { sortSavedKeywords } from "./sort";

const row = (text: string, volume: number | null, sourceSeed: string | null): SavedKeywordRow => ({
  countryCode: "US",
  cpc: volume,
  difficulty: volume,
  intent: sourceSeed,
  languageCode: "en",
  location: "US",
  publicId: text,
  savedAt: "2026-01-01T00:00:00.000Z",
  sourceSeed,
  text,
  trend: [],
  variantCount: 0,
  volume,
});

describe("saved keyword sorting", () => {
  const rows = [row("z", 2, "beta"), row("n", null, null), row("a", 10, "alpha")];
  it.each([
    ["asc", ["z", "a", "n"]],
    ["desc", ["a", "z", "n"]],
  ] as const)("sorts raw numbers %s with null last", (direction, expected) => {
    expect(sortSavedKeywords(rows, { field: "volume", direction }).map((r) => r.text)).toEqual(
      expected,
    );
  });
  it.each(["difficulty", "cpc"])("sorts %s numerically in both directions", (field) => {
    expect(sortSavedKeywords(rows, { field, direction: "asc" }).map((r) => r.text)).toEqual([
      "z",
      "a",
      "n",
    ]);
    expect(sortSavedKeywords(rows, { field, direction: "desc" }).map((r) => r.text)).toEqual([
      "a",
      "z",
      "n",
    ]);
  });
  it("sorts by keyword and saved timestamp", () => {
    expect(
      sortSavedKeywords(rows, { field: "keyword", direction: "asc" }).map((r) => r.text),
    ).toEqual(["a", "n", "z"]);
    const dated = rows.map((r, index) => ({
      ...r,
      savedAt: `2026-01-0${index + 1}T00:00:00.000Z`,
    }));
    expect(
      sortSavedKeywords(dated, { field: "savedAt", direction: "desc" }).map((r) => r.text),
    ).toEqual(["a", "n", "z"]);
    expect(
      sortSavedKeywords(dated, { field: "savedAt", direction: "asc" }).map((r) => r.text),
    ).toEqual(["z", "n", "a"]);
  });
  it("sorts text and leaves nulls last descending", () => {
    expect(
      sortSavedKeywords(rows, { field: "source", direction: "desc" }).map((r) => r.text),
    ).toEqual(["z", "a", "n"]);
  });
});
