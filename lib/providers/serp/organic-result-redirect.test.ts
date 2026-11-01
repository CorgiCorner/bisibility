import { describe, expect, it } from "vitest";
import { dataForSeoOrganicDecision } from "./dataforseo-payload";
import { decideOrganicResult } from "./organic-result-decision";
import { requireDeterminateOrganicResult } from "./payload-contract-error";
import { serpApiOrganicCandidates } from "./serpapi-payload";

const redirect = "https://www.google.com/goto?url=opaque-synthetic-value";
const competitor = { domain: "example.org", rank: 1, url: "https://example.org/page" };
const resolved = { domain: "example.com", rank: 4, url: "https://example.com/page" };

describe("unresolved organic destination", () => {
  it("never treats the intermediary as a ranking URL for its own host", () => {
    expect(
      decideOrganicResult({
        candidates: [{ domain: "google.com", rank: 1, url: redirect }],
        depth: 100,
        domain: "google.com",
      }),
    ).toMatchObject({ outcome: "indeterminate", organicResults: [], rankingUrl: null });
  });

  it("keeps the earliest unresolved rank regardless of result order", () => {
    const candidates = [resolved, { rank: 8, url: redirect }, { rank: 2, url: redirect }];
    for (const rows of [candidates, [...candidates].reverse()]) {
      expect(
        decideOrganicResult({ candidates: rows, depth: 100, domain: "example.com" }).outcome,
      ).toBe("indeterminate");
    }
  });

  it("fails closed when only out-of-depth unresolved rows are available", () => {
    expect(
      decideOrganicResult({
        candidates: [{ rank: 11, url: redirect }],
        depth: 10,
        domain: "example.com",
      }).outcome,
    ).toBe("indeterminate");
  });

  it.each(["example.com", "google.com", "example.org", undefined])(
    "does not confirm a miss for a redirect with domain %s and a competitor",
    (domain) => {
      const decision = decideOrganicResult({
        candidates: [competitor, { domain, rank: 2, url: redirect }],
        depth: 100,
        domain: "example.com",
      });
      expect(decision).toMatchObject({
        outcome: "indeterminate",
        position: null,
        rankingUrl: null,
        organicResults: [expect.objectContaining({ domain: "example.org" })],
        anomalies: [{ code: "organic_result_unclassifiable", index: 1 }],
      });
      expect(() => requireDeterminateOrganicResult("DataForSEO", decision)).toThrow(
        "organic payload is indeterminate",
      );
    },
  );

  it.each([1, 4, undefined, null, "2", 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "does not accept a worse or ambiguous match when unresolved rank is %s",
    (rank) => {
      expect(
        decideOrganicResult({
          candidates: [resolved, { rank, url: redirect }],
          depth: 100,
          domain: "example.com",
        }),
      ).toMatchObject({ outcome: "indeterminate", position: null, rankingUrl: null });
    },
  );

  it("preserves a resolved best result ahead of unresolved destinations", () => {
    expect(
      decideOrganicResult({
        candidates: [{ domain: "example.com", rank: 8, url: redirect }, resolved],
        depth: 100,
        domain: "example.com",
      }),
    ).toMatchObject({
      outcome: "match",
      position: 4,
      rankingUrl: resolved.url,
      organicResults: [expect.objectContaining({ url: resolved.url })],
    });
  });

  it.each([10, 20, 50, 100] as const)("respects the top-%i boundary", (depth) => {
    for (const [rank, outcome] of [
      [depth, "indeterminate"],
      [depth + 1, "no_match"],
    ] as const) {
      expect(
        decideOrganicResult({
          candidates: [competitor, { rank, url: redirect }],
          depth,
          domain: "example.com",
        }).outcome,
      ).toBe(outcome);
    }
  });

  it.each([
    "http://google.com/goto?url=synthetic",
    "https://GOOGLE.COM/goto?url=synthetic",
    "https://www.google.com./goto/?url=synthetic",
  ])("recognizes the intermediary URL %s", (url) => {
    expect(
      decideOrganicResult({
        candidates: [competitor, { rank: 2, url }],
        depth: 100,
        domain: "example.com",
      }).outcome,
    ).toBe("indeterminate");
  });

  it.each([
    "https://example.org/goto?url=synthetic",
    "https://google.com.example.org/goto?url=synthetic",
    "https://google.com/search?q=synthetic",
    "https://google.com/goto-other?url=synthetic",
  ])("does not treat ordinary destination %s as an unresolved redirect", (url) => {
    expect(
      decideOrganicResult({ candidates: [{ rank: 1, url }], depth: 100, domain: "example.com" })
        .outcome,
    ).toBe("no_match");
  });

  it("preserves ordinary conflicting-domain behavior", () => {
    expect(
      decideOrganicResult({
        candidates: [
          competitor,
          { domain: "example.com", rank: 2, url: "https://example.org/other" },
        ],
        depth: 100,
        domain: "example.com",
      }),
    ).toMatchObject({
      outcome: "no_match",
      anomalies: [{ code: "organic_result_unclassifiable", index: 1 }],
    });
  });

  it("uses the same guard for both provider payloads without resolving URLs", () => {
    const dataForSeo = dataForSeoOrganicDecision(
      [
        { type: "organic", domain: "example.com", rank_group: 2, url: redirect },
        { type: "organic", domain: competitor.domain, rank_group: 1, url: competitor.url },
      ],
      "example.com",
      100,
    );
    const serpApi = decideOrganicResult({
      candidates: serpApiOrganicCandidates(
        [
          { displayed_link: "example.com", position: 2, link: redirect },
          { displayed_link: competitor.domain, position: 1, link: competitor.url },
        ],
        0,
      ),
      depth: 100,
      domain: "example.com",
    });
    expect(dataForSeo).toEqual(serpApi);
    expect(dataForSeo.outcome).toBe("indeterminate");
  });
});
