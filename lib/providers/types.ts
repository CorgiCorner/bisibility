import type { SerpRankLocation } from "@/lib/serp/location";
import type { SerpDepth } from "@/lib/serp/markets";
import type {
  AnalyticsQueryStatsInput,
  AnalyticsTopQuery,
  PageStatRow,
  QueryStatRow,
} from "./analytics-types";
import type {
  DomainOverviewInput,
  DomainOverviewResult,
  HistoricalOverviewResult,
  HistoricalRankOverviewInput,
  RelevantPagesInput,
  RelevantPagesResult,
} from "./domain-overview-types";

export type {
  AnalyticsMetricRange,
  AnalyticsQueryStatsInput,
  AnalyticsTopQuery,
  PageStatRow,
  QueryStatRow,
} from "./analytics-types";
export type {
  DomainOverviewInput,
  DomainOverviewResult,
  DomainRankMetrics,
  HistoricalOverviewResult,
  HistoricalOverviewRow,
  HistoricalRankOverviewInput,
  RelevantPageRow,
  RelevantPagesInput,
  RelevantPagesResult,
} from "./domain-overview-types";

export type ProviderCredentials = {
  login?: string;
  password?: string;
  apiKey?: string;
  endpoint?: string;
  onRefreshToken?: (refreshToken: string) => Promise<void>;
};

export type ProviderCredentialRequirement = "apiKey" | "endpoint" | "login" | "password";
export type ProviderStatus = "connected" | "needs_reauth" | "ready" | "planned" | "optional";
export type ProviderKind = "serp" | "analytics" | "enrichment";
export type SerpDevice = "desktop" | "mobile";

export type ProviderTestResult = {
  ok: boolean;
  message: string;
  balance?: number;
};

export type SerpRankInput = {
  keyword: string;
  completedCheckCount?: number;
  location: SerpRankLocation;
  device: SerpDevice;
  domain: string;
  depth?: SerpDepth;
  stopOnMatch?: boolean;
  credentials?: ProviderCredentials;
};

export type SerpOrganicResult = {
  rank: number;
  url: string;
  title: string | null;
  domain: string | null;
};

export type SerpRawPayload = {
  normalization?: {
    anomalies: Array<{ code: string; index: number }>;
    outcome: "match" | "no_match";
    version: "v2";
  };
  organic_results: SerpOrganicResult[];
  serp_features?: string[];
};

export type SerpRankResult = {
  billingUnits?: number;
  position: number | null;
  rankingUrl: string | null;
  costCents: number;
  checkedAt: Date;
  raw?: SerpRawPayload | null;
};

export type RankedKeywordRow = {
  keyword: string;
  position: number | null;
  searchVolume: number | null;
  estimatedTraffic: number | null;
  cpcCents: number | null;
  difficulty: number | null;
  intent: "informational" | "navigational" | "commercial" | "transactional" | null;
  rankingUrl: string | null;
  serpFeatures: string[];
  rankAbsoluteDelta: number | null; // previous rankAbsolute minus current rankAbsolute
  rankAbsolute: number | null;
};

export type RankedKeywordsPage = {
  /** Raw provider items consumed by this offset page, before malformed rows are dropped. */
  consumedCount: number;
  rows: RankedKeywordRow[];
  totalCount: number | null;
  costCents: number;
};

export type KeywordMetrics = {
  searchVolume: number | null;
  cpcCents: number | null;
  competition: number | null;
  difficulty: number | null;
  intent: "informational" | "commercial" | "transactional" | "navigational" | "unknown" | null;
  monthlyTrend: { month: number; searchVolume: number | null; year: number }[];
};

export type ResearchKeywordRow = { keyword: string } & KeywordMetrics;
export type ResearchPage = { costCents: number; rows: ResearchKeywordRow[] };

export type BacklinkTargetScope = "site" | "page";
export type BacklinkRowMode = "as_is" | "one_per_domain";
export type BacklinkFlag = "nofollow" | "ugc" | "sponsored" | "image" | "sitewide";

export type BacklinkSummary = {
  backlinksTotal: number;
  brokenBacklinks: number;
  brokenPages: number;
  dofollowPct: number;
  domainRank: number;
  lostBacklinks: number;
  lostReferringDomains: number;
  newBacklinks: number;
  newReferringDomains: number;
  referringDomainsTotal: number;
  referringPages: number;
  spamScore: number;
};

type BacklinkHistoryRow = {
  lostLinks: number;
  lostReferringDomains: number;
  month: string;
  newLinks: number;
  newReferringDomains: number;
};

export type BacklinkRow = {
  anchor: string;
  domainAuthority: number;
  firstSeen: string | null;
  flags: BacklinkFlag[];
  linksCount: number;
  lostAt: string | null;
  sourceDomain: string;
  sourceUrl: string;
  spamScore: number;
  status: "active" | "new" | "lost";
  targetUrl: string;
};

export type BacklinkTargetInput = {
  includeSubdomains: boolean;
  target: string;
  targetScope: BacklinkTargetScope;
};

export type BacklinkSummaryResult = { costCents: number; summary: BacklinkSummary };
export type BacklinkHistoryResult = { costCents: number; rows: BacklinkHistoryRow[] };
export type BacklinkRowsResult = {
  costCents: number;
  rows: BacklinkRow[];
  totalCount: number;
};

export type KeywordResearchInput = {
  includeClickstream: boolean;
  limit: number;
  location: SerpRankLocation;
  seed: string;
};

export type SerpProvider = {
  id: string;
  label: string;
  testConnection(creds: ProviderCredentials): Promise<ProviderTestResult>;
  fetchRank(input: SerpRankInput): Promise<SerpRankResult>;
  fetchRankedKeywords?(
    credentials: ProviderCredentials,
    input: {
      domain: string;
      languageCode?: string;
      limit: number;
      location: SerpRankLocation;
      locationCode?: number;
      offset: number;
    },
  ): Promise<RankedKeywordsPage>;
  fetchRelatedKeywords?(
    credentials: ProviderCredentials,
    input: KeywordResearchInput,
  ): Promise<ResearchPage>;
  fetchKeywordSuggestions?(
    credentials: ProviderCredentials,
    input: KeywordResearchInput,
  ): Promise<ResearchPage>;
  fetchKeywordIdeas?(
    credentials: ProviderCredentials,
    input: KeywordResearchInput,
  ): Promise<ResearchPage>;
  fetchKeywordMetrics?(
    credentials: ProviderCredentials,
    input: {
      includeClickstream: boolean;
      keywords: string[];
      location: SerpRankLocation;
    },
  ): Promise<ResearchPage>;
  fetchBacklinksSummary?(
    credentials: ProviderCredentials,
    input: BacklinkTargetInput,
  ): Promise<BacklinkSummaryResult>;
  fetchBacklinksHistory?(
    credentials: ProviderCredentials,
    input: BacklinkTargetInput,
  ): Promise<BacklinkHistoryResult>;
  fetchBacklinksRows?(
    credentials: ProviderCredentials,
    input: BacklinkTargetInput & {
      limit: number;
      mode: BacklinkRowMode;
      offset: number;
    },
  ): Promise<BacklinkRowsResult>;
  fetchDomainRankOverview?(
    credentials: ProviderCredentials,
    input: DomainOverviewInput,
  ): Promise<DomainOverviewResult>;
  fetchHistoricalRankOverview?(
    credentials: ProviderCredentials,
    input: HistoricalRankOverviewInput,
  ): Promise<HistoricalOverviewResult>;
  fetchRelevantPages?(
    credentials: ProviderCredentials,
    input: RelevantPagesInput,
  ): Promise<RelevantPagesResult>;
};

export type AnalyticsProvider = {
  id: string;
  label: string;
  testConnection(creds: ProviderCredentials): Promise<ProviderTestResult>;
  fetchTopQueries?(
    credentials: ProviderCredentials,
    input: { limit: number },
  ): Promise<AnalyticsTopQuery[]>;
  fetchQueryStats?(
    credentials: ProviderCredentials,
    input: AnalyticsQueryStatsInput,
  ): Promise<QueryStatRow[]>;
  fetchPageStats?(
    credentials: ProviderCredentials,
    input: { startDate: string; endDate: string; limit?: number },
  ): Promise<PageStatRow[]>;
};

export type ProviderCatalogItem = {
  id: string;
  label: string;
  kind: ProviderKind;
  defaultStatus: ProviderStatus;
  requiredCredentials?: readonly ProviderCredentialRequirement[];
  logoDomain?: string;
};
