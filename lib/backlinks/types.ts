import type {
  ActionPaymentOption,
  ActionPaymentQuote,
  ActionPaymentReceipt,
} from "@/lib/action-payment/contract";
import type { ActionPaymentInput } from "@/lib/action-payment/session";
import type { ProviderLookupFailure } from "@/lib/provider-lookups/paid-call";
import type { ProviderRequestOrigin } from "@/lib/provider-usage/surface";
import type { BacklinkFlag, BacklinkRowMode, BacklinkTargetScope } from "@/lib/providers/types";
import type { ProviderUsageFailurePhase } from "@/lib/providers/usage";

export type BacklinksServiceContext = {
  actorId?: string | null;
  origin: ProviderRequestOrigin;
  projectId: string;
};

export type AnalyzeBacklinksOptions = ActionPaymentInput & {
  estimateOnly?: boolean;
  fresh?: boolean;
  includeSubdomains?: boolean;
  maxCostCents?: number;
  mode?: BacklinkRowMode;
  provider?: string;
  resultLimit?: 100 | 300 | 500 | 1000;
  target: string;
  targetScope?: BacklinkTargetScope;
};

export type LoadMoreBacklinkRowsOptions = ActionPaymentInput & {
  estimateOnly?: boolean;
  maxCostCents?: number;
  snapshotRef?: string;
  includeSubdomains: boolean;
  limit: number;
  provider?: string;
  target: string;
  targetScope: BacklinkTargetScope;
};

export type BacklinksSummary = {
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

export type BacklinksHistoryMonth = {
  lostLinks: number;
  lostReferringDomains: number;
  month: string;
  newLinks: number;
  newReferringDomains: number;
};

export type BacklinksRow = {
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

export type BacklinksSnapshot = {
  originalPayment?: ActionPaymentReceipt;
  appendPayment?: ActionPaymentReceipt;
  payment?: ActionPaymentReceipt;
  /** Opaque reference required when extending this exact row revision. */
  snapshotRef?: string;
  cached: boolean;
  cachedUntil: string;
  costCents: number;
  fetchedAt: string;
  fetchedRowCount: number;
  history: BacklinksHistoryMonth[];
  historyUnavailable?: boolean;
  includeSubdomains: boolean;
  ok: true;
  provider: string;
  rows: BacklinksRow[];
  summary: BacklinksSummary;
  target: string;
  targetScope: BacklinkTargetScope;
  totalRowsAvailable: number;
};

/**
 * A free dry run. It carries only the cost facts, never report fields, so a caller cannot
 * mistake it for an empty backlink profile.
 */
export type BacklinksEstimate = {
  payment?: ActionPaymentQuote;
  paymentOptions?: ActionPaymentOption[];
  cached: boolean;
  /** Expiry of the unexpired snapshot the paid call would reuse; null without one. */
  cachedUntil: string | null;
  costCents: number;
  estimate: true;
  estimatedCostCents: number;
  includeSubdomains: boolean;
  ok: true;
  provider: string;
  target: string;
  targetScope: BacklinkTargetScope;
};

export type BacklinksHistoryFailure = {
  code: "provider_usage_unconfirmed" | "provider_transient" | "unexpected_error";
  phase: ProviderUsageFailurePhase | null;
};

/** Failed current request evidence, never a successful or reusable report snapshot. */
export type BacklinksFailedSummary = {
  payment?: ActionPaymentReceipt;
  costCents: null;
  knownSummaryCostCents: number;
  historyFailure: BacklinksHistoryFailure;
  historyStatus: "failed";
  includeSubdomains: boolean;
  ok: false;
  provider: string;
  reason: "history_failed";
  rowsStatus: "not_requested";
  status: "failed";
  summary: BacklinksSummary;
  target: string;
  targetScope: BacklinkTargetScope;
};

export type BacklinksOutcome =
  | BacklinksSnapshot
  | BacklinksEstimate
  | BacklinksFailedSummary
  | ProviderLookupFailure;

export function isBacklinksFailedSummary(outcome: {
  ok: boolean;
  reason?: string;
}): outcome is BacklinksFailedSummary {
  return !outcome.ok && outcome.reason === "history_failed";
}

export function isBacklinksEstimate(
  outcome: BacklinksEstimate | BacklinksSnapshot,
): outcome is BacklinksEstimate {
  return "estimate" in outcome && outcome.estimate === true;
}
/** A dry run prices the next page without extending its stored snapshot. */
export type BacklinksRowsOutcome = BacklinksSnapshot | BacklinksEstimate | ProviderLookupFailure;
