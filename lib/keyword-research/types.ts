import type { ProviderLookupFailure } from "@/lib/provider-lookups/paid-call";
import type { KeywordMetrics } from "@/lib/providers/types";

export type KeywordResearchMode = "auto" | "ideas" | "related" | "suggestions";
export type KeywordResearchSource = "idea" | "related" | "suggestion";
export type KeywordResearchSourceReason =
  | import("@/lib/action-payment/contract").ActionPaymentFailure
  | "wallet_budget_exhausted"
  | "insufficient_credits"
  | "budget_exhausted"
  | "cost_limit"
  | "in_progress"
  | "needs_reauth"
  | "no_source"
  | "own_credentials_required"
  | "credentials_changed"
  | "previous_source_failed"
  | "provider_error"
  | "rate_limited"
  | "result_limit"
  | "unsupported_location";
export type KeywordResearchConnection = { id: string; label: string; provider: string };
export type KeywordResearchRow = KeywordMetrics & {
  alreadySaved: boolean;
  alreadyTracked: boolean;
  keyword: string;
  source: KeywordResearchSource;
};
export type KeywordResearchSourceDiagnostic = {
  cached: boolean;
  costCents: number;
  reason?: KeywordResearchSourceReason;
  returned: number;
  source: KeywordResearchSource;
  status: "failed" | "ok" | "skipped";
};
export type { ProviderLookupFailure };

export type KeywordResearchSuccess = {
  payment?: import("@/lib/action-payment/contract").ActionPaymentReceipt;
  cached: boolean;
  cachedUntil: string;
  connections: KeywordResearchConnection[];
  costCents: number;
  fetchedAt: string;
  ok: true;
  provider: string;
  rows: KeywordResearchRow[];
  sources: KeywordResearchSourceDiagnostic[];
};

export type KeywordResearchSourceEstimate = {
  freeUntil?: string;
  cached: boolean;
  costCents: number;
  source: KeywordResearchSource;
};

/**
 * A free dry run. It carries only the per-source cost facts, never rows, fetch times, or
 * source statuses, so a caller cannot mistake it for an empty research result.
 */
export type KeywordResearchEstimate = {
  payment?: import("@/lib/action-payment/contract").ActionPaymentQuote;
  paymentOptions?: import("@/lib/action-payment/contract").ActionPaymentOption[];
  cached: boolean;
  connections: KeywordResearchConnection[];
  costCents: number;
  estimate: true;
  ok: true;
  provider: string;
  sources: KeywordResearchSourceEstimate[];
};

export type KeywordResearchOutcome =
  | KeywordResearchSuccess
  | KeywordResearchEstimate
  | ProviderLookupFailure;

export function isKeywordResearchEstimate(
  outcome: KeywordResearchEstimate | KeywordResearchSuccess,
): outcome is KeywordResearchEstimate {
  return "estimate" in outcome && outcome.estimate === true;
}

export type KeywordMetricsSuccess = {
  payment?:
    | import("@/lib/action-payment/contract").ActionPaymentQuote
    | import("@/lib/action-payment/contract").ActionPaymentReceipt;
  paymentOptions?: import("@/lib/action-payment/contract").ActionPaymentOption[];
  cachedCount: number;
  connections: KeywordResearchConnection[];
  costCents: number;
  fetchedAt: string;
  fetchedCount: number;
  fetchedCountEstimate?: number;
  estimatedCostCents?: number;
  estimate?: boolean;
  ok: true;
  provider: string;
  rows: Array<{ keyword: string } & KeywordMetrics>;
};

export type KeywordMetricsOutcome = KeywordMetricsSuccess | ProviderLookupFailure;
