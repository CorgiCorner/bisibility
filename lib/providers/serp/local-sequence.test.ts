import { describe, expect, it } from "vitest";
import { localRankPosition, localSequenceProvider, parseLocalRankSequence } from "./local-sequence";

describe("local sequence SERP provider", () => {
  it("parses a staged rank sequence from keyword text", () => {
    expect(parseLocalRankSequence("alerts test [seq:5, 15,15,4]")).toEqual([5, 15, 15, 4]);
  });

  it("advances by completed check count and clamps at the final position", () => {
    const keyword = "alerts test [seq:5,15,15,4]";
    expect([0, 1, 2, 3, 4, 20].map((count) => localRankPosition(keyword, count))).toEqual([
      5, 15, 15, 4, 4, 4,
    ]);
  });

  it("uses a stable fallback for missing or invalid sequences", () => {
    expect(localRankPosition("alerts test")).toBe(20);
    expect(localRankPosition("alerts test [seq:5,nope,4]", 1)).toBe(20);
    expect(localRankPosition("alerts test [seq:0,101]", 1)).toBe(20);
  });

  it("returns deterministic rank data without credentials", async () => {
    await expect(
      localSequenceProvider.fetchRank({
        completedCheckCount: 1,
        device: "desktop",
        domain: "example.com",
        keyword: "alerts test [seq:5,15]",
        location: {
          gl: "us",
          hl: "en",
          primaryGeoCode: null,
          primaryGeoName: "United States",
          secondaryGeoName: "United States",
        },
      }),
    ).resolves.toMatchObject({ costCents: 0, position: 15 });
  });
});
