import { describe, expect, it } from "vitest";
import { decideOrganicResult } from "./organic-result-decision";

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    domain: "competitor.example.org",
    rank: 1,
    title: "Competitor",
    url: "https://competitor.example.org/page",
    ...overrides,
  };
}

describe("organic result decision", () => {
  it("selects the minimum rank across every matching URL and preserves its exact URL", () => {
    const result = decideOrganicResult({
      candidates: [
        candidate({
          domain: "blog.example.com",
          rank: 8,
          url: "https://blog.example.com/first?utm_source=serp#result",
        }),
        candidate({
          domain: "example.com",
          rank: 2,
          url: "https://example.com/best/",
        }),
      ],
      depth: 100,
      domain: "www.example.com",
    });

    expect(result).toMatchObject({
      anomalies: [],
      outcome: "match",
      position: 2,
      rankingUrl: "https://example.com/best/",
    });
  });

  it("makes a matching result without an organic rank indeterminate", () => {
    expect(
      decideOrganicResult({
        candidates: [
          candidate({
            domain: "example.com",
            rank: undefined,
            url: "https://example.com/missing-rank",
          }),
        ],
        depth: 100,
        domain: "example.com",
      }),
    ).toMatchObject({
      anomalies: [{ code: "organic_rank_missing", index: 0 }],
      outcome: "indeterminate",
    });
  });

  it("keeps a valid match when only a known nonmatching result has a malformed rank", () => {
    expect(
      decideOrganicResult({
        candidates: [
          candidate({ rank: undefined }),
          candidate({
            domain: "example.com",
            rank: 4,
            url: "https://example.com/ranking",
          }),
        ],
        depth: 100,
        domain: "example.com",
      }),
    ).toMatchObject({
      anomalies: [{ code: "organic_rank_missing", index: 0 }],
      outcome: "match",
      position: 4,
      rankingUrl: "https://example.com/ranking",
    });
  });

  it("refuses a valid minimum when another matching result has an invalid rank", () => {
    expect(
      decideOrganicResult({
        candidates: [
          candidate({
            domain: "example.com",
            rank: 4,
            url: "https://example.com/known",
          }),
          candidate({
            domain: "blog.example.com",
            rank: "2",
            url: "https://blog.example.com/unknown",
          }),
        ],
        depth: 100,
        domain: "example.com",
      }),
    ).toMatchObject({
      anomalies: [{ code: "organic_rank_invalid", index: 1 }],
      outcome: "indeterminate",
    });
  });

  it("treats an unclassifiable organic result as indeterminate", () => {
    expect(
      decideOrganicResult({
        candidates: [candidate({ domain: undefined, url: "http://[invalid/path" })],
        depth: 100,
        domain: "example.com",
      }),
    ).toMatchObject({
      anomalies: [{ code: "organic_result_unclassifiable", index: 0 }],
      outcome: "indeterminate",
    });
  });

  it("skips an unclassifiable item when another organic result is usable", () => {
    const decision = decideOrganicResult({
      candidates: [
        { rank: 1 },
        {
          domain: "example.com",
          rank: 4,
          url: "https://example.com/usable",
        },
      ],
      depth: 100,
      domain: "example.com",
    });

    expect(decision).toMatchObject({
      anomalies: [{ code: "organic_result_unclassifiable", index: 0 }],
      outcome: "match",
      position: 4,
      rankingUrl: "https://example.com/usable",
    });
  });

  it("returns a determinate no-match for an empty organic result set", () => {
    expect(decideOrganicResult({ candidates: [], depth: 100, domain: "example.com" })).toEqual({
      anomalies: [],
      organicResults: [],
      outcome: "no_match",
      position: null,
      rankingUrl: null,
    });
  });

  it.each([10, 20, 50, 100] as const)("accepts an exact top-%i boundary rank", (depth) => {
    expect(
      decideOrganicResult({
        candidates: [
          candidate({
            domain: "example.com",
            rank: depth,
            url: `https://example.com/rank-${depth}`,
          }),
        ],
        depth,
        domain: "example.com",
      }),
    ).toMatchObject({ outcome: "match", position: depth });
  });

  it("bounds anomaly details without including provider values", () => {
    const result = decideOrganicResult({
      candidates: Array.from({ length: 30 }, () =>
        candidate({ domain: "competitor.example.org", rank: undefined }),
      ),
      depth: 100,
      domain: "example.com",
    });

    expect(result.anomalies).toHaveLength(20);
    expect(JSON.stringify(result.anomalies)).not.toContain("competitor.example.org");
  });
});
