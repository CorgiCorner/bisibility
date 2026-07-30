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
                      keyword_info: { search_volume: 900 },
                    },
                    ranked_serp_element: { serp_item: { etv: 42.7, rank_absolute: 3 } },
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
      costCents: 2.04,
      rows: [
        { estimatedTraffic: 42.7, keyword: "rank tracker", position: 3, searchVolume: 900 },
        { estimatedTraffic: null, keyword: "seo api", position: null, searchVolume: null },
      ],
      totalCount: 245,
    });
  });

  it("returns an empty page when an offset has no rows", () => {
    expect(
      dataForSeoRankedKeywordsPage({
        tasks: [{ cost: 0.02, result: [{ items: [], total_count: 100 }] }],
      }),
    ).toEqual({ costCents: 2, rows: [], totalCount: 100 });
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
