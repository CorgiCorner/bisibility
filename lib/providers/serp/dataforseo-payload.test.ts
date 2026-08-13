import { describe, expect, it } from "vitest";
import {
  dataForSeoKeywordIdeasPage,
  dataForSeoKeywordMetricsPage,
  dataForSeoKeywordSuggestionsPage,
  dataForSeoRankedKeywordsPage,
  dataForSeoRelatedKeywordsPage,
} from "./dataforseo-payload";

const fullItem = {
  keyword: " keyword research ",
  keyword_info: {
    competition: 0.42,
    cpc: 1.239,
    monthly_searches: [{ month: 6, search_volume: 880, year: 2026 }],
    search_volume: 900,
  },
  keyword_info_normalized_with_clickstream: {
    monthly_searches: [{ month: 6, search_volume: 990, year: 2026 }],
    search_volume: 1_000,
  },
  keyword_properties: { keyword_difficulty: 47 },
  search_intent_info: { main_intent: "commercial" },
};

const mappedFullItem = {
  competition: 0.42,
  cpcCents: 124,
  difficulty: 47,
  intent: "commercial",
  keyword: "keyword research",
  monthlyTrend: [{ month: 6, searchVolume: 990, year: 2026 }],
  searchVolume: 1_000,
};

describe("DataForSEO ranked-keyword payload", () => {
  it("keeps organic position when ads and AI overview precede it", () => {
    const page = dataForSeoRankedKeywordsPage({
      tasks: [
        {
          result: [
            {
              items: [
                {
                  keyword_data: { keyword: "organic rank parity" },
                  ranked_serp_element: {
                    serp_features: ["paid", "ai_overview"],
                    serp_item: {
                      rank_absolute: 5,
                      rank_group: 2,
                      type: "organic",
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    expect(page.rows[0]?.position).toBe(2);
  });

  it("maps rows, total count, nullable metrics, and provider cost", () => {
    expect(
      dataForSeoRankedKeywordsPage({
        cost: 0.0204,
        tasks: [
          {
            result: [
              {
                items: [
                  {
                    keyword_data: {
                      keyword: " rank tracker ",
                      keyword_info: { search_volume: 900, cpc: 1.239 },
                      keyword_properties: { keyword_difficulty: 47 },
                      search_intent_info: { main_intent: "commercial" },
                      serp_info: { serp_item_types: ["featured_snippet", "organic", 7] },
                    },
                    ranked_serp_element: {
                      serp_item: {
                        etv: 42.7,
                        rank_absolute: 5,
                        rank_group: 3,
                        rank_changes: { previous_rank_absolute: 8 },
                        url: " https://example.com/rank-tracker ",
                      },
                    },
                  },
                  {
                    keyword_data: { keyword: "seo api", keyword_info: {} },
                    ranked_serp_element: { serp_item: {} },
                  },
                ],
                total_count: 245,
              },
            ],
          },
        ],
      }),
    ).toEqual({
      consumedCount: 2,
      costCents: 2.04,
      rows: [
        {
          cpcCents: 124,
          difficulty: 47,
          estimatedTraffic: 42.7,
          intent: "commercial",
          keyword: "rank tracker",
          position: 3,
          rankAbsoluteDelta: 3,
          rankAbsolute: 5,
          rankingUrl: "https://example.com/rank-tracker",
          searchVolume: 900,
          serpFeatures: ["featured_snippet", "organic"],
        },
        {
          cpcCents: null,
          difficulty: null,
          estimatedTraffic: null,
          intent: null,
          keyword: "seo api",
          position: null,
          rankAbsoluteDelta: null,
          rankAbsolute: null,
          rankingUrl: null,
          searchVolume: null,
          serpFeatures: [],
        },
      ],
      totalCount: 245,
    });
  });

  it("falls back to ranked serp element difficulty and normalizes malformed values", () => {
    const page = dataForSeoRankedKeywordsPage({
      tasks: [
        {
          result: [
            {
              items: [
                {
                  keyword_data: {
                    keyword: "fallback difficulty",
                    keyword_info: { cpc: null },
                    keyword_properties: null,
                    search_intent_info: { main_intent: "wheel" },
                    serp_info: { serp_item_types: [123, "organic", null, "ai_overview"] },
                  },
                  ranked_serp_element: {
                    keyword_difficulty: 62,
                    serp_item: {
                      rank_absolute: 11,
                      rank_group: 9,
                      url: "   ",
                    },
                  },
                },
                {
                  keyword_data: { keyword: "delta noise", keyword_info: { cpc: Number.NaN } },
                  ranked_serp_element: {
                    serp_item: {
                      rank_absolute: 4,
                      rank_changes: { previous_rank_absolute: "n/a" },
                    },
                  },
                },
                {
                  keyword_data: { keyword: "   " },
                  ranked_serp_element: { serp_item: {} },
                },
                {
                  ranked_serp_element: { serp_item: { rank_absolute: 2 } },
                },
              ],
              total_count: 2,
            },
          ],
        },
      ],
    });

    expect(page.rows).toEqual([
      {
        cpcCents: null,
        difficulty: 62,
        estimatedTraffic: null,
        intent: null,
        keyword: "fallback difficulty",
        position: 9,
        rankAbsoluteDelta: null,
        rankAbsolute: 11,
        rankingUrl: null,
        searchVolume: null,
        serpFeatures: ["organic", "ai_overview"],
      },
      {
        cpcCents: null,
        difficulty: null,
        estimatedTraffic: null,
        intent: null,
        keyword: "delta noise",
        position: null,
        rankAbsoluteDelta: null,
        rankAbsolute: 4,
        rankingUrl: null,
        searchVolume: null,
        serpFeatures: [],
      },
    ]);
    expect(page.totalCount).toBe(2);
    expect(page.consumedCount).toBe(4);
  });

  it("returns an empty page when an offset has no rows", () => {
    expect(
      dataForSeoRankedKeywordsPage({
        tasks: [{ cost: 0.02, result: [{ items: [], total_count: 100 }] }],
      }),
    ).toEqual({ consumedCount: 0, costCents: 2, rows: [], totalCount: 100 });
  });
});

describe("DataForSEO keyword research payloads", () => {
  it("maps related keyword_data rows and clickstream-refined metrics", () => {
    expect(
      dataForSeoRelatedKeywordsPage({
        cost: 0.0101,
        tasks: [{ result: [{ items: [{ keyword_data: fullItem }] }] }],
      }),
    ).toEqual({ costCents: 1.01, rows: [mappedFullItem] });
  });

  it("keeps CPC and competition from keyword_info when clickstream data is present", () => {
    const page = dataForSeoKeywordSuggestionsPage({
      tasks: [{ result: [{ items: [fullItem] }] }],
    });
    expect(page.rows[0]).toMatchObject({ competition: 0.42, cpcCents: 124, searchVolume: 1_000 });
  });

  it("maps keyword suggestions rows", () => {
    expect(
      dataForSeoKeywordSuggestionsPage({
        cost: 0.0101,
        tasks: [{ result: [{ items: [fullItem] }] }],
      }),
    ).toEqual({ costCents: 1.01, rows: [mappedFullItem] });
  });

  it("maps keyword ideas rows", () => {
    expect(
      dataForSeoKeywordIdeasPage({
        cost: 0.0101,
        tasks: [{ result: [{ items: [fullItem] }] }],
      }),
    ).toEqual({ costCents: 1.01, rows: [mappedFullItem] });
  });

  it("pins nullable Ads-only metrics returned by keyword overview", () => {
    expect(
      dataForSeoKeywordMetricsPage({
        cost: 0.0101,
        tasks: [
          {
            result: [
              {
                items: [
                  {
                    keyword: "ads only market",
                    keyword_info: {
                      competition: 0.7,
                      cpc: 0.505,
                      monthly_searches: [{ month: 5, search_volume: null, year: 2026 }],
                      search_volume: 10,
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual({
      costCents: 1.01,
      rows: [
        {
          competition: 0.7,
          cpcCents: 51,
          difficulty: null,
          intent: null,
          keyword: "ads only market",
          monthlyTrend: [{ month: 5, searchVolume: null, year: 2026 }],
          searchVolume: 10,
        },
      ],
    });
  });
});
