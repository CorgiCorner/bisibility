import { testUsageObserver } from "@/lib/providers/usage-test-observer";
import type { SerpRankLocation } from "@/lib/serp/location";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decideOrganicResult } from "./organic-result-decision";
import { serpApiProvider } from "./serpapi";
import { serpApiOrganicCandidates } from "./serpapi-payload";
import { fetchSerpApiSnapshotPage } from "./serpapi-snapshot";
import { UnresolvedRedirectError } from "./unresolved-redirect-error";

const hidden = "/goto?url=https%3A%2F%2Fexample.com%2Fhidden";
const real = { displayed_link: "example.com", link: "https://example.com/real", position: 4 };
const location: SerpRankLocation = {
  gl: "us",
  hl: "en",
  primaryGeoCode: null,
  primaryGeoName: "United States",
  secondaryGeoName: "United States",
};

function decisionFor(results: readonly unknown[], depth: 10 | 20 | 50 | 100 = 100) {
  return decideOrganicResult({
    candidates: serpApiOrganicCandidates(results, 0),
    depth,
    domain: "example.com",
  });
}

describe("SerpApi redirect rows", () => {
  it("does not keep a worse match when a relative goto ranks ahead of it", () => {
    expect(
      decisionFor([{ displayed_link: "example.org", link: hidden, position: 1 }, real]),
    ).toMatchObject({ outcome: "indeterminate", position: null, rankingUrl: null });
  });

  it("does not record a miss when displayed_link is the only tracked-domain row", () => {
    expect(
      decisionFor([
        { displayed_link: "example.com", link: hidden, position: 1 },
        { displayed_link: "example.org", link: "https://example.org/other", position: 2 },
      ]),
    ).toMatchObject({ outcome: "indeterminate", position: null, rankingUrl: null });
  });

  it.each([
    "https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fhidden",
    "/url?q=https%3A%2F%2Fexample.com%2Fhidden",
    "https://www.google.com/url?q=https://example.com/hidden",
    "/url?q=https://example.com/hidden",
  ])("treats %s as an unresolved redirect ahead of a real row", (link) => {
    expect(
      decisionFor([
        { displayed_link: "example.com", link, position: 1 },
        { displayed_link: "example.com", link: "https://example.com/later", position: 6 },
      ]).outcome,
    ).toBe("indeterminate");
  });

  it.each([
    "https://www.google.co.uk/goto?url=synthetic",
    "//www.google.com/goto?url=synthetic",
    "//goto?url=synthetic",
    "/goto?url=synthetic",
  ])("recognizes %s before a later match", (url) => {
    expect(
      decideOrganicResult({
        candidates: [
          { domain: "example.org", rank: 1, url },
          { domain: "example.com", rank: 4, url: "https://example.com/real" },
        ],
        depth: 100,
        domain: "example.com",
      }).outcome,
    ).toBe("indeterminate");
  });

  it("keeps a match that ranks ahead of a later redirect or conflicting row", () => {
    expect(
      decideOrganicResult({
        candidates: [
          ...serpApiOrganicCandidates(
            [{ displayed_link: "example.com", link: "https://example.com/best", position: 2 }],
            0,
          ),
          { domain: "example.org", rank: 8, url: hidden },
          { domain: "example.com", rank: 9, url: "https://example.org/conflict" },
        ],
        depth: 100,
        domain: "example.com",
      }),
    ).toMatchObject({
      outcome: "match",
      position: 2,
      rankingUrl: "https://example.com/best",
    });
  });

  it("allows a miss when a conflicting row is beyond the requested depth", () => {
    expect(
      decideOrganicResult({
        candidates: [
          { domain: "example.org", rank: 1, url: "https://example.org/page" },
          { domain: "example.com", rank: 11, url: "https://example.org/other" },
        ],
        depth: 10,
        domain: "example.com",
      }).outcome,
    ).toBe("no_match");
  });

  it("ranks a normal page from absolute destination links", () => {
    expect(
      decisionFor([
        {
          displayed_link: "example.org",
          link: "https://example.org/a",
          position: 1,
          title: "Other",
        },
        {
          displayed_link: "www.example.com",
          link: "https://example.com/best",
          position: 3,
          title: "Best",
        },
      ]),
    ).toMatchObject({
      outcome: "match",
      position: 3,
      rankingUrl: "https://example.com/best",
      organicResults: [
        { domain: "example.org", rank: 1, title: "Other", url: "https://example.org/a" },
        { domain: "example.com", rank: 3, title: "Best", url: "https://example.com/best" },
      ],
    });
  });

  it("does not match from displayed_link when the link points elsewhere", () => {
    expect(
      decisionFor([
        {
          displayed_link: "example.com",
          link: "https://example.org/elsewhere",
          position: 1,
          source: "Example",
        },
      ]),
    ).toMatchObject({ outcome: "no_match", position: null, rankingUrl: null });
  });

  it("is indeterminate when a conflicting row ranks ahead of the tracked domain", () => {
    expect(
      decideOrganicResult({
        candidates: [
          { domain: "example.com", rank: 2, url: "https://example.org/other" },
          { domain: "example.com", rank: 5, url: "https://example.com/real" },
        ],
        depth: 100,
        domain: "example.com",
      }),
    ).toMatchObject({ outcome: "indeterminate", position: null, rankingUrl: null });
  });
});

describe("SerpApi unresolved redirect failure", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("fails a live check when a redirect row can change the ranking", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            organic_results: [
              { displayed_link: "example.com", link: hidden, position: 1 },
              { displayed_link: "example.org", link: "https://example.org/other", position: 2 },
            ],
            search_metadata: { status: "Success" },
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        ),
      ),
    );

    await expect(
      serpApiProvider.fetchRank({
        credentials: { apiKey: "serp-key", usageObserver: testUsageObserver },
        depth: 10,
        device: "desktop",
        domain: "example.com",
        keyword: "rank tracker",
        location,
      }),
    ).rejects.toBeInstanceOf(UnresolvedRedirectError);
  });

  it("fails a snapshot page when a redirect row can change the ranking", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            organic_results: [{ displayed_link: "example.com", link: hidden, position: 1 }],
            search_metadata: { id: "page-3", status: "Success" },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      fetchSerpApiSnapshotPage(
        {
          keyword: "changed keyword",
          domain: "example.org",
          device: "desktop",
          location,
          credentials: {
            apiKey: "test-key",
            usageObserver: {
              begin: vi.fn().mockResolvedValue("receipt"),
              settle: vi.fn().mockResolvedValue(undefined),
            },
          },
        },
        {
          version: 1,
          capturedAt: new Date().toISOString(),
          keyword: "original keyword",
          domain: "example.com",
          device: "mobile",
          nextStart: 20,
          ended: false,
          location,
        },
        20,
        20,
      ),
    ).rejects.toBeInstanceOf(UnresolvedRedirectError);
  });
});
