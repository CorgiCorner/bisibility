import { describe, expect, it } from "vitest";
import { type CompetitorScoreRow, competitorShareOfVoice } from "./competitor-share";

const domains = ["mine.test", "rival.test"];
function row(id: string, volume: number | null, ranks = [1, 10]): CompetitorScoreRow {
  return {
    id,
    volume,
    ranks: Object.fromEntries(domains.map((domain, index) => [domain, ranks[index]])),
    quality: Object.fromEntries(
      domains.map((domain) => [domain, { evidence: "positive", freshness: "fresh", reason: null }]),
    ),
  };
}
describe("legacy Top10 SoV through shared weights", () => {
  it("preserves the linear Top10 formula and normalizes only the selected domain set", () => {
    const result = competitorShareOfVoice([row("a", 100), row("b", 10, [10, 1])], domains);
    expect(result.definitionVersion).toBe("bisibility-sov-top10-v2");
    expect(result.shares.get(domains[0])).toBeCloseTo(101 / 121);
    expect(result.domainSet).toEqual([...domains].sort());
  });
  it("uses the shared median for unknown volume, retains real zero, and reports imputation", () => {
    const result = competitorShareOfVoice(
      [row("a", 100), row("b", null, [10, 1]), row("c", 0)],
      domains,
    );
    expect(result.shares.get(domains[0])).toBeCloseTo(105 / 165);
    expect(result.imputedWeightShare).toBeCloseTo(1 / 3);
    expect(result.measured).toBe(3);
    expect(competitorShareOfVoice([row("a", null)], domains).shares.get(domains[0])).toBeCloseTo(
      10 / 11,
    );
  });
  it("returns null for zero denominator, including real-zero weight and known absence", () => {
    expect([...competitorShareOfVoice([row("a", 0)], domains).shares.values()]).toEqual([
      null,
      null,
    ]);
    const absent = row("a", 100);
    absent.ranks = { "mine.test": null, "rival.test": null };
    absent.quality = Object.fromEntries(
      domains.map((domain) => [
        domain,
        { evidence: "known_absent", freshness: "fresh", reason: null },
      ]),
    );
    expect([...competitorShareOfVoice([absent], domains).shares.values()]).toEqual([null, null]);
  });
  it("excludes the whole row if one compared domain is unknown or stale, preserving expected coverage", () => {
    const unknown = row("b", 1e10);
    unknown.quality = {
      ...unknown.quality,
      "rival.test": { evidence: "unknown", freshness: "fresh", reason: "unproven_absence" },
    };
    const stale = row("c", 1e10);
    stale.quality = {
      ...stale.quality,
      "rival.test": { evidence: "positive", freshness: "stale", reason: null },
    };
    const result = competitorShareOfVoice([row("a", 100), unknown, stale], domains);
    expect(result).toMatchObject({
      expected: 3,
      measured: 1,
      unknown: 1,
      stale: 1,
      dataCoverage: 1 / 3,
    });
    expect(result.shares.get(domains[0])).toBeCloseTo(10 / 11);
  });
  it("never treats unproved legacy rank numbers as current evidence", () => {
    expect(
      competitorShareOfVoice(
        [{ id: "legacy", volume: 1, ranks: { "mine.test": 1 } }],
        ["mine.test"],
      ).shares.get("mine.test"),
    ).toBeNull();
  });
});
