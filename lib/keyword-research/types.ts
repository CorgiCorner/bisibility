import type { ProviderLookupFailure } from "@/lib/provider-lookups/paid-call";
import type { KeywordMetrics } from "@/lib/providers/types";

export type KeywordResearchMode = "auto" | "ideas" | "related" | "suggestions";
export type KeywordResearchSource = "idea" | "related" | "suggestion";
export type KeywordResearchSourceReason =
  | "budget_exhausted"
  | "cost_limit"
  | "in_progress"
  | "needs_reauth"
  | "no_source"
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
  cached: boolean;
  costCents: number;
  source: KeywordResearchSource;
};

/**
 * A free dry run. It carries only the per-source cost facts, never rows, fetch times, or
 * source statuses, so a caller cannot mistake it for an empty research result.
 */
export type KeywordResearchEstimate = {
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
