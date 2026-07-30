import { ga4AnalyticsProvider } from "./analytics/ga4";
import { gscAnalyticsProvider } from "./analytics/gsc";
import { plausibleAnalyticsProvider } from "./analytics/plausible";
import { dataForSeoProvider } from "./serp/dataforseo";
import {
  fakeBacklinksHistory,
  fakeBacklinksRows,
  fakeBacklinksSummary,
} from "./serp/fake-backlinks";
import { localSequenceProvider } from "./serp/local-sequence";
import { serpApiProvider } from "./serp/serpapi";
import type {
  AnalyticsProvider,
  AnalyticsTopQuery,
  PageStatRow,
  ProviderCatalogItem,
  QueryStatRow,
  SerpProvider,
  SerpRankInput,
} from "./types";

const BASE_PROVIDER_CATALOG = [
  {
    id: "dataforseo",
    label: "DataForSEO",
    kind: "serp",
    defaultStatus: "ready",
    requiredCredentials: ["login", "password"],
    logoDomain: "dataforseo.com",
  },
  {
    id: "serpapi",
    label: "SerpAPI",
    kind: "serp",
    defaultStatus: "ready",
    requiredCredentials: ["apiKey"],
    logoDomain: "serpapi.com",
  },
  {
    id: "gsc",
    label: "Google Search Console",
    kind: "analytics",
    defaultStatus: "optional",
    requiredCredentials: ["apiKey", "login"],
    logoDomain: "google.com",
  },
  {
    id: "ga4",
    label: "Google Analytics 4",
    kind: "analytics",
    defaultStatus: "optional",
    requiredCredentials: ["apiKey", "login"],
    logoDomain: "google.com",
  },
  {
    id: "plausible",
    label: "Plausible",
    kind: "analytics",
    defaultStatus: "optional",
    requiredCredentials: ["apiKey", "login"],
    logoDomain: "plausible.io",
  },
] as const satisfies ProviderCatalogItem[];

const LOCAL_SEQUENCE_CATALOG_ITEM = {
  id: "local-sequence",
  label: "Local sequence (dev-only)",
  kind: "serp",
  defaultStatus: "ready",
  logoDomain: undefined,
  requiredCredentials: [],
} as const satisfies ProviderCatalogItem;

export function localSequenceProviderEnabled(nodeEnv: string | undefined, explicitFlag?: string) {
  return nodeEnv !== "production" && (nodeEnv !== "test" || explicitFlag === "1");
}

const localSequenceEnabled = localSequenceProviderEnabled(
  process.env.NODE_ENV,
  process.env.BISIBILITY_DEV_SERP_PROVIDER,
);

export const PROVIDER_CATALOG = [
  ...BASE_PROVIDER_CATALOG,
  ...(localSequenceEnabled ? [LOCAL_SEQUENCE_CATALOG_ITEM] : []),
] as const satisfies readonly ProviderCatalogItem[];

export type ProviderTint = "accent" | "blue" | "green" | "purple";

export function tintFor(provider: string): ProviderTint {
  return PROVIDER_CATALOG.find((entry) => entry.id === provider)?.kind === "analytics"
    ? "blue"
    : "accent";
}

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
      return {
        checkedAt: new Date("2026-06-19T00:00:00.000Z"),
        costCents: 0,
        position,
        rankingUrl: `https://${input.domain}/rank-${position}`,
      };
    },
    ...(id === "dataforseo"
      ? {
          async fetchBacklinksSummary() {
            return fakeBacklinksSummary();
          },
          async fetchBacklinksHistory() {
            return fakeBacklinksHistory();
          },
          async fetchBacklinksRows(_credentials, input) {
            return fakeBacklinksRows(input);
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

const fakeQueryStats: QueryStatRow[] = [
  { clicks: 42, ctr: 0.12, impressions: 350, position: 3.4, query: "rank tracker" },
  {
    clicks: 18,
    ctr: 0.08,
    impressions: 225,
    page: "/docs",
    position: 5.1,
    query: "keyword api",
  },
];

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
      return fakeQueryStats.slice(0, input.limit ?? fakeQueryStats.length);
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
    return fakeSerpProvider(provider.id, provider.label);
  }

  return provider;
}

export function serpProviderCapabilities(id: string) {
  const provider = serpProviders[id];
  if (!provider) return null;
  return {
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
