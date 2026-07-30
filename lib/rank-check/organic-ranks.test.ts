import { describe, expect, it } from "vitest";
import {
  organicDomainRanksFromRaw,
  organicDomainRanksFromResults,
  storedOrganicDomainRanks,
} from "./organic-ranks";

describe("organic rank snapshots", () => {
  it("normalizes, deduplicates, and sorts every top-100 organic domain", () => {
    expect(
      organicDomainRanksFromResults([
        { domain: "www.Example.com", rank: 8, title: null, url: "https://example.com/a" },
        { domain: "competitor.dev", rank: 2, title: null, url: "https://competitor.dev" },
        { domain: "example.com", rank: 3, title: null, url: "https://example.com/b" },
        { domain: "outside.dev", rank: 101, title: null, url: "https://outside.dev" },
      ]),
    ).toEqual([
      { domain: "competitor.dev", position: 2 },
      { domain: "example.com", position: 3 },
    ]);
  });

  it("reads legacy provider shapes and distinguishes unavailable data from an empty SERP", () => {
    expect(organicDomainRanksFromRaw({ source: "import" })).toBeNull();
    expect(organicDomainRanksFromRaw({ organic_results: [] })).toEqual([]);
    expect(
      organicDomainRanksFromRaw({
        tasks: [
          { result: [{ items: [{ domain: "rankzly.io", rank_group: 4, type: "organic" }] }] },
        ],
      }),
    ).toEqual([{ domain: "rankzly.io", position: 4 }]);
    expect(
      organicDomainRanksFromRaw({
        organic_results: [
          { domain: "", position: 5, url: "https://competitor.dev/path" },
          { domain: "Example.com.", position: 7 },
        ],
      }),
    ).toEqual([
      { domain: "competitor.dev", position: 5 },
      { domain: "example.com", position: 7 },
    ]);
  });

  it("validates stored JSON before exposing it to comparison queries", () => {
    expect(
      storedOrganicDomainRanks([
        { domain: "www.example.com", position: 6 },
        { domain: "example.com", position: 2 },
        { domain: "bad.dev", position: 0 },
      ]),
    ).toEqual([{ domain: "example.com", position: 2 }]);
    expect(storedOrganicDomainRanks(null)).toBeNull();
  });
});
