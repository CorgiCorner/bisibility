import type { SavedKeywordRow } from "@/lib/saved-keywords/model";
import { describe, expect, it } from "vitest";
import { savedKeywordsCsv } from "./saved-keywords-export";

const rows: SavedKeywordRow[] = [
  {
    cpc: 1.12,
    difficulty: 31,
    intent: "transactional",
    location: "US",
    publicId: "skw_1",
    savedAt: "2026-07-22T12:00:00.000Z",
    sourceSeed: 'standing "desk", ideas',
    text: 'standing "desk", mat',
    trend: [],
    variantCount: 0,
    volume: 12_100,
  },
  {
    cpc: null,
    difficulty: null,
    intent: null,
    location: "PL",
    publicId: "skw_2",
    savedAt: "2026-07-23T09:30:00.000Z",
    sourceSeed: null,
    text: "plain keyword",
    trend: [],
    variantCount: 0,
    volume: null,
  },
];

describe("savedKeywordsCsv", () => {
  it("builds the exact saved-keyword export columns and escapes text fields", () => {
    expect(savedKeywordsCsv(rows)).toBe(
      [
        "keyword,volume,kd,cpc,intent,source_seed,location,saved_at",
        '"standing ""desk"", mat",12100,31,1.12,transactional,"standing ""desk"", ideas",US,2026-07-22T12:00:00.000Z',
        "plain keyword,,,,,,PL,2026-07-23T09:30:00.000Z",
      ].join("\n"),
    );
  });
});
