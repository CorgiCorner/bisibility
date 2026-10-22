import type {
  ActionPaymentOption,
  ActionPaymentQuote,
  ActionPaymentReceipt,
} from "@/lib/action-payment/contract";
import type { ActionPaymentInput } from "@/lib/action-payment/session";
import type { ProviderLookupFailure } from "@/lib/provider-lookups/paid-call";
import type { ProviderRequestOrigin } from "@/lib/provider-usage/surface";
import type {
  DomainRankMetrics,
  HistoricalOverviewRow,
  RankedKeywordsPage,
  RelevantPagesResult,
} from "@/lib/providers/types";
import type { DomainOverviewFailureDetails } from "./failure-details";

export type DomainOverviewScope = "root" | "subdomain";

export type DomainOverviewServiceContext = {
  actorId?: string | null;
  origin: ProviderRequestOrigin;
  projectId: string;
};

export type DomainOverviewResearchScope = {
  countryCode?: string;
  languageCode: string;
  locationCode: number;
};

export type AnalyzeDomainOverviewOptions = DomainOverviewResearchScope &
  ActionPaymentInput & {
    estimateOnly?: boolean;
    fresh?: boolean;
    keywordLimit?: number;
    maxCostCents?: number;
    pageLimit?: number;
    scopeOverride?: DomainOverviewScope;
    target: string;
  };

export type LoadDomainModuleOptions = DomainOverviewResearchScope &
  ActionPaymentInput & {
    estimateOnly?: boolean;
    fresh?: boolean;
    limit: number;
    maxCostCents?: number;
    offset: number;
    scopeOverride?: DomainOverviewScope;
    target: string;
  };

export type LoadDomainHistoryOptions = DomainOverviewResearchScope &
  ActionPaymentInput & {
    estimateOnly?: boolean;
    fresh?: boolean;
    maxCostCents?: number;
    scopeOverride?: DomainOverviewScope;
    target: string;
  };

export type DomainOverviewLookupFailure = (
  | (ProviderLookupFailure & { costCents: number })
  | {
      costCents: number;
      ok: false;
      reason: Exclude<DomainOverviewFailureDetails["reason"], ProviderLookupFailure["reason"]>;
    }
) & {
  payment?: ActionPaymentReceipt;
  phase?: DomainOverviewFailureDetails["phase"];
  providerCode?: DomainOverviewFailureDetails["providerCode"];
};

export type DomainPaymentEstimate = {
  ok: true;
  estimate: true;
  cached: boolean;
  estimatedCostCents: number;
  payment?: ActionPaymentQuote;
  paymentOptions?: ActionPaymentOption[];
};

export type DomainModulePaymentOutcome<T> = DomainModuleOutcome<T> | DomainPaymentEstimate;

export type DomainModuleOutcome<T> =
  | {
      payment?: ActionPaymentReceipt;
      cached: boolean;
      costCents: number;
      data: T;
      fetchedAt: string | null;
      ok: true;
    }
  | DomainOverviewLookupFailure;

export type DomainOverviewEstimate = {
  payment?: ActionPaymentQuote;
  paymentOptions?: ActionPaymentOption[];
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
  originalPayment?: ActionPaymentReceipt;
  appendPayment?: ActionPaymentReceipt;
  historyPayment?: ActionPaymentReceipt;
  payment?: ActionPaymentReceipt;
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
  originalPayment?: ActionPaymentReceipt;
  cachedUntil: string;
  fetchedAt: string;
  languageCode: string;
  locationCode: number;
  scope: DomainOverviewScope;
  target: string;
};
