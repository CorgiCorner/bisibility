import type { ProviderLookupFailure } from "@/lib/provider-lookups/paid-call";
import type {
  DomainRankMetrics,
  HistoricalOverviewRow,
  RankedKeywordsPage,
  RelevantPagesResult,
} from "@/lib/providers/types";

export type DomainOverviewScope = "root" | "subdomain";

export type DomainOverviewServiceContext = {
  actorId?: string | null;
  projectId: string;
};

export type DomainOverviewMarket = {
  countryCode?: string;
  languageCode: string;
  locationCode: number;
};

export type AnalyzeDomainOverviewOptions = DomainOverviewMarket & {
  estimateOnly?: boolean;
  fresh?: boolean;
  keywordLimit?: number;
  maxCostCents?: number;
  pageLimit?: number;
  scopeOverride?: DomainOverviewScope;
  target: string;
};

export type LoadDomainModuleOptions = DomainOverviewMarket & {
  fresh?: boolean;
  limit: number;
  maxCostCents?: number;
  offset: number;
  scopeOverride?: DomainOverviewScope;
  target: string;
};

export type LoadDomainHistoryOptions = DomainOverviewMarket & {
  fresh?: boolean;
  maxCostCents?: number;
  scopeOverride?: DomainOverviewScope;
  target: string;
};

export type DomainOverviewLookupFailure =
  | (ProviderLookupFailure & { costCents: number })
  | { costCents: number; ok: false; reason: "lookup_failed" | "snapshot_expired" };

export type DomainModuleOutcome<T> =
  | {
      cached: boolean;
      costCents: number;
      data: T;
      fetchedAt: string;
      ok: true;
    }
  | DomainOverviewLookupFailure;

export type DomainOverviewEstimate = {
  cached: boolean;
  estimate: true;
  estimatedCostCents: number;
  freshEstimatedCostCents: number;
  historyEstimatedCostCents: number;
  historyMode: "lazy";
  keywordPageEstimatedCostCents: number;
  languageCode: string;
  locationCode: number;
  ok: true;
  pagePageEstimatedCostCents: number;
  provider: string;
  scope: DomainOverviewScope;
  target: string;
};

export type DomainOverviewReport = {
  cached: boolean;
  cachedUntil: string;
  costCents: number;
  fetchedAt: string;
  historyMode: "lazy";
  keywords: DomainModuleOutcome<RankedKeywordsPage>;
  languageCode: string;
  locationCode: number;
  ok: true;
  overview: DomainRankMetrics | null;
  pages: DomainModuleOutcome<RelevantPagesResult>;
  previousFetchedAt: string | null;
  previousOverview: DomainRankMetrics | null;
  previousSourceSnapshotAt: string | null;
  provider: string;
  scope: DomainOverviewScope;
  sourceSnapshotAt: string | null;
  state: "no_data" | "ok" | "partial";
  target: string;
};

export type DomainOverviewOutcome =
  | DomainOverviewEstimate
  | DomainOverviewReport
  | DomainOverviewLookupFailure;

export type DomainHistoryOutcome = DomainModuleOutcome<HistoricalOverviewRow[]>;

export type DomainRecentTarget = {
  cachedUntil: string;
  fetchedAt: string;
  languageCode: string;
  locationCode: number;
  scope: DomainOverviewScope;
  target: string;
};
