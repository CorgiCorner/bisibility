import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { SearchInsightsBandRow } from "@/lib/search-insights/queries/band-list";
import type { SearchInsightsList } from "@/lib/search-insights/queries/detail-model";
import type { SearchInsightsOverlapRow } from "@/lib/search-insights/queries/overlap-list";
import type { SearchInsightsPageDetail } from "@/lib/search-insights/queries/page-detail";
import type { SearchInsightsQueryDetail } from "@/lib/search-insights/queries/query-detail";

const WINDOW_DAYS = 28;

function perDay(seed: number) {
  return Array.from({ length: WINDOW_DAYS }, (_, index) => ({
    clicks: Math.max(0, Math.round(seed * (0.6 + 0.4 * Math.abs(Math.sin(index + seed))))),
    date: `2026-06-${String(11 + index).padStart(2, "0")}`,
  }));
}

export const storyQueryDetail: SearchInsightsQueryDetail = {
  keyEventsConfigured: true,
  pageMetricsReadable: true,
  pages: {
    rows: [
      {
        clicks: 214,
        engagementRate: 0.58,
        keyEvents: 7,
        path: "/guides/rank-tracking",
        position: 4.2,
        url: "https://example.com/guides/rank-tracking",
      },
      {
        clicks: 96,
        engagementRate: 0.41,
        keyEvents: 2,
        path: "/blog/rank-tracking-2026",
        position: 8.6,
        url: "https://example.com/blog/rank-tracking-2026",
      },
    ],
    total: 2,
  },
  perDay: perDay(11),
  query: "rank tracking software",
  stats: { clicks: 310, ctr: 0.041, impressions: 7_560, position: 5.4 },
  tracked: false,
};

export const storyPageDetail: SearchInsightsPageDetail = {
  engagementRate: null,
  keyEvents: null,
  path: "/guides/rank-tracking",
  perDay: perDay(9),
  queries: {
    rows: [
      { clicks: 214, position: 4.2, query: "rank tracking software" },
      { clicks: 88, position: 6.9, query: "daily rank checks" },
      { clicks: 41, position: 12.3, query: "keyword position tracker" },
    ],
    total: 12,
  },
  sessions: null,
  stats: { clicks: 343, ctr: 0.038, impressions: 9_020, position: 6.1 },
  url: "https://example.com/guides/rank-tracking",
};

export const storyBandList: SearchInsightsList<SearchInsightsBandRow> = {
  rows: [
    { clicks: 44, impressions: 12_400, position: 6.2, query: "keyword position tracker" },
    { clicks: 21, impressions: 8_900, position: 11.4, query: "serp tracking tool" },
    { clicks: 9, impressions: 4_120, position: 17.8, query: "check google ranking daily" },
  ],
  total: 33,
};

export const storyOverlapList: SearchInsightsList<SearchInsightsOverlapRow> = {
  rows: [
    {
      clicks: 310,
      pages: 3,
      position: 5.4,
      query: "rank tracking software",
      split: [
        {
          clicks: 214,
          path: "/guides/rank-tracking",
          url: "https://example.com/guides/rank-tracking",
        },
        {
          clicks: 96,
          path: "/blog/rank-tracking-2026",
          url: "https://example.com/blog/rank-tracking-2026",
        },
      ],
    },
    {
      clicks: 128,
      pages: 2,
      position: 8.1,
      query: "daily rank checks",
      split: [
        {
          clicks: 80,
          path: "/guides/rank-tracking",
          url: "https://example.com/guides/rank-tracking",
        },
        { clicks: 48, path: "/pricing", url: "https://example.com/pricing" },
      ],
    },
  ],
  total: 5,
};

export const storyProjectMarkets: ProjectMarketsView = {
  markets: [
    {
      canonicalKey: "es-es",
      countryCode: "ES",
      displayName: "Spain",
      id: "mkt_1",
      languageCode: "es",
      languageLabel: "Spanish",
      monthlyCostCents: 240,
      researchAvailable: true,
      status: "active",
    },
    {
      canonicalKey: "es-en",
      countryCode: "ES",
      displayName: "Spain",
      id: "mkt_2",
      languageCode: "en",
      languageLabel: "English",
      monthlyCostCents: 240,
      researchAvailable: true,
      status: "active",
    },
    {
      canonicalKey: "be-nl",
      countryCode: "BE",
      displayName: "Belgium",
      id: "mkt_3",
      languageCode: "nl",
      languageLabel: "Dutch",
      monthlyCostCents: 240,
      researchAvailable: false,
      status: "paused",
    },
  ],
  maxMarkets: 5,
  monthlyCostCents: 480,
  perMarketChecks: 30,
  projectId: "prj_1",
};

export const storyCostContext: ProjectCostContext = {
  capCents: 5_000,
  costPerCheckCents: 0.06,
  cronExpression: null,
  depth: 100,
  deviceCount: 1,
  devices: ["desktop"],
  frequency: "daily",
  keywordCount: 24,
  locationCount: 1,
  projectName: "example.com",
  providerId: "dataforseo",
  rawFrequency: "daily",
  spentCents: 120,
  timezone: "UTC",
};
