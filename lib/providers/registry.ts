import { PROVIDER_CATALOG } from "./catalog-metadata";

export { PROVIDER_CATALOG } from "./catalog-metadata";

import { dataForSeoRankRequest } from "@/lib/providers/serp/dataforseo-rank-request";
import { ga4AnalyticsProvider } from "./analytics/ga4";
import { gscAnalyticsProvider } from "./analytics/gsc";
import { gscQueryDimensions } from "./analytics/gsc-query-pagination";
import { plausibleAnalyticsProvider } from "./analytics/plausible";
import { developmentSerpProvider } from "./development-serp";
import { syntheticProviderResult } from "./fake-request-receipts";
import { dataForSeoProvider } from "./serp/dataforseo";
import {
  fakeBacklinksHistory,
  fakeBacklinksRows,
  fakeBacklinksSummary,
} from "./serp/fake-backlinks";
import { localSequenceProvider } from "./serp/local-sequence";
import { localSequenceProviderEnabled } from "./serp/synthetic-mode";
import { syntheticSerpObservation } from "./serp/synthetic-observation";

export { localSequenceProviderEnabled } from "./serp/synthetic-mode";

import { serpApiRankRequest } from "@/lib/providers/serp/serpapi-request";
import { serpApiProvider } from "./serp/serpapi";
import type {
  AnalyticsProvider,
  AnalyticsQueryStatsInput,
  AnalyticsTopQuery,
  PageStatRow,
  QueryStatRow,
  SerpProvider,
  SerpRankInput,
} from "./types";

export type ProviderTint = "accent" | "blue" | "green" | "purple";

export function tintFor(provider: string): ProviderTint {
  return PROVIDER_CATALOG.find((entry) => entry.id === provider)?.kind === "analytics"
    ? "blue"
    : "accent";
}

const localSequenceEnabled = localSequenceProviderEnabled(
  process.env.NODE_ENV,
  process.env.BISIBILITY_DEV_SERP_PROVIDER,
);

const serpProviders: Record<string, SerpProvider> = {
  dataforseo: dataForSeoProvider,
  serpapi: serpApiProvider,
  ...(localSequenceEnabled ? { "local-sequence": localSequenceProvider } : {}),
};

const analyticsProviders: Record<string, AnalyticsProvider> = {
  gsc: gscAnalyticsProvider,
  ga4: ga4AnalyticsProvider,
  plausible: plausibleAnalyticsProvider,
};

export function providerLogoDomain(id: string) {
  return PROVIDER_CATALOG.find((provider) => provider.id === id)?.logoDomain ?? null;
}

function stablePosition(input: SerpRankInput) {
  const value = [input.keyword, input.location.secondaryGeoName, input.device, input.domain].join(
    "|",
  );
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 997;
  }
  return (hash % 20) + 1;
}

function fakeSerpProvider(id: string, label: string): SerpProvider {
  return {
    id,
    label: `${label} (fake)`,
    async testConnection() {
      return { balance: 100, message: "Fake provider ready", ok: true };
    },
    async fetchRank(input) {
      const position = stablePosition(input);
      const checkedAt = new Date("2026-06-19T00:00:00.000Z");
      const rankingUrl = `https://${input.domain}/rank-${position}`;
      const request = input.credentials?.usageObserver
        ? id === "dataforseo"
          ? dataForSeoRankRequest(input)
          : id === "serpapi"
            ? serpApiRankRequest(input)
            : undefined
        : undefined;
      return syntheticProviderResult(
        input.credentials,
        () => ({
          checkedAt,
          observation: syntheticSerpObservation(id, input, { checkedAt, position, rankingUrl }),
          costCents: 0,
          position,
          rankingUrl: `https://${input.domain}/rank-${position}`,
        }),
        request,
      );
    },
    ...(id === "dataforseo"
      ? {
          async fetchBacklinksSummary(credentials) {
            return syntheticProviderResult(credentials, fakeBacklinksSummary);
          },
          async fetchBacklinksHistory(credentials) {
            return syntheticProviderResult(credentials, fakeBacklinksHistory);
          },
          async fetchBacklinksRows(credentials, input) {
            return syntheticProviderResult(credentials, () => fakeBacklinksRows(input));
          },
        }
      : {}),
  };
}

const fakeTopQueries: AnalyticsTopQuery[] = [
  { clicks: 42, impressions: 860, query: "rank tracker" },
  { clicks: 28, impressions: 520, query: "seo api" },
  { clicks: 19, impressions: 410, query: "keyword monitoring" },
];

const fakeGa4TopQueries: AnalyticsTopQuery[] = [
  { clicks: 34, query: "pricing" },
  { clicks: 21, query: "docs" },
  { clicks: 13, query: "integrations" },
];

const fakeQueryStatSeeds = [
  {
    clicks: 42,
    country: "usa",
    ctr: 0.12,
    device: "desktop" as const,
    impressions: 350,
    page: "/rank",
    position: 3.4,
    query: "rank tracker",
  },
  {
    clicks: 18,
    country: "gbr",
    ctr: 0.08,
    device: "mobile" as const,
    impressions: 225,
    page: "/docs",
    position: 5.1,
    query: "keyword api",
  },
];

function fakeQueryStatRows(input: AnalyticsQueryStatsInput): QueryStatRow[] {
  const dimensions = new Set(gscQueryDimensions(input));
  const rows = fakeQueryStatSeeds.filter((row) => {
    if (input.country && row.country !== input.country.toLowerCase()) return false;
    if (input.device && row.device !== input.device) return false;
    return true;
  });
  const offset = input.offset ?? 0;
  return rows.slice(offset, offset + (input.limit ?? rows.length)).map((row) => ({
    clicks: row.clicks,
    ctr: row.ctr,
    impressions: row.impressions,
    position: row.position,
    query: row.query,
    ...(dimensions.has("page") ? { page: row.page } : {}),
    ...(dimensions.has("country") ? { country: row.country } : {}),
    ...(dimensions.has("device") ? { device: row.device } : {}),
  }));
}

const fakePageStats: PageStatRow[] = [
  {
    bounceRate: 0.38,
    path: "/",
    scrollDepth: 71,
    sessions: 120,
    visitDurationSeconds: 84,
    visitors: 95,
  },
  {
    bounceRate: 0.44,
    path: "/pricing",
    scrollDepth: 66,
    sessions: 82,
    visitDurationSeconds: 64,
    visitors: 70,
  },
];

function fakeAnalyticsProvider(id: string, label: string): AnalyticsProvider {
  return {
    id,
    label: `${label} (fake)`,
    async testConnection() {
      return { message: "Fake analytics source ready", ok: true };
    },
    async fetchTopQueries(_credentials, input) {
      const rows = id === "ga4" ? fakeGa4TopQueries : fakeTopQueries;
      return rows.slice(0, input.limit);
    },
    async fetchQueryStats(_credentials, input) {
      return fakeQueryStatRows(input);
    },
    async fetchPageStats(_credentials, input) {
      return fakePageStats.slice(0, input.limit ?? fakePageStats.length);
    },
  };
}

export function getSerpProvider(id: string) {
  const provider = serpProviders[id];
  if (!provider) {
    throw new Error(`Unknown SERP provider: ${id}`);
  }

  if (process.env.BISIBILITY_FAKE_PROVIDER === "1") {
    const fake = fakeSerpProvider(provider.id, provider.label);
    return developmentSerpProvider(fake) ?? fake;
  }

  return provider;
}

export function serpProviderCapabilities(id: string) {
  const provider = serpProviders[id];
  if (!provider) return null;
  return {
    domainOverview:
      typeof provider.fetchDomainRankOverview === "function" &&
      typeof provider.fetchHistoricalRankOverview === "function" &&
      typeof provider.fetchRankedKeywords === "function" &&
      typeof provider.fetchRelevantPages === "function",
    backlinks:
      typeof provider.fetchBacklinksSummary === "function" ||
      typeof provider.fetchBacklinksHistory === "function" ||
      typeof provider.fetchBacklinksRows === "function",
    keywordMetrics: typeof provider.fetchKeywordMetrics === "function",
    keywordResearch:
      typeof provider.fetchRelatedKeywords === "function" ||
      typeof provider.fetchKeywordSuggestions === "function" ||
      typeof provider.fetchKeywordIdeas === "function",
    rankCheck: true,
    rankedKeywords: typeof provider.fetchRankedKeywords === "function",
  };
}

export function getAnalyticsProvider(id: string) {
  const provider = analyticsProviders[id];
  if (!provider) {
    throw new Error(`Unknown analytics provider: ${id}`);
  }

  if (process.env.BISIBILITY_FAKE_PROVIDER === "1") {
    return fakeAnalyticsProvider(provider.id, provider.label);
  }

  return provider;
}
