import type { ProviderRequestFeature } from "@/lib/provider-usage/request-features";
import { deploymentFreeOperationProviderSpend } from "./operation-provider-spend-extension";

/**
 * The single registry of REST operations that cause provider spend. An operation is paid when it
 * makes a provider-billed request itself (`inline`) or creates, enables or queues work that will
 * (`deferred`: runs, schedules, rank checks a keyword schedule dispatches). Estimates and reads
 * are free and absent here.
 *
 * `features` are the provider request features every billed request is attributed to
 * (`PROVIDER_REQUEST_FEATURES`). `handler` is the module that serves the operation;
 * `operation-provider-spend.test.ts` checks that it reaches billed-request code (inline) or the
 * work it queues (deferred), that every billed feature is claimed, and `x-bisibility-cost` on
 * every operation is generated from this registry.
 */
export type OperationProviderSpend = {
  /** The request flag that returns a free estimate instead of spending. */
  estimate?: { param: "estimate_only"; response?: string };
  features: readonly ProviderRequestFeature[];
  handler: string;
  timing: "deferred" | "inline";
};

const inline = (
  handler: string,
  features: ProviderRequestFeature[],
  estimate?: OperationProviderSpend["estimate"],
): OperationProviderSpend => ({
  ...(estimate ? { estimate } : {}),
  features,
  handler,
  timing: "inline",
});

const deferred = (handler: string, features: ProviderRequestFeature[]): OperationProviderSpend => ({
  features,
  handler,
  timing: "deferred",
});

const estimateOnly = (response?: string) => ({
  param: "estimate_only" as const,
  ...(response ? { response } : {}),
});

/** Explicit free classifications for operations added while integrating the contract stack. */
export const operationProviderFree = {
  ...deploymentFreeOperationProviderSpend,
  deleteMe: { handler: "lib/api/me.ts", kind: "free" },
  deleteDevicePushToken: { handler: "lib/api/push-tokens.ts", kind: "free" },
  listDevicePushTokens: { handler: "lib/api/push-tokens.ts", kind: "free" },
  registerDevicePushToken: { handler: "lib/api/push-tokens.ts", kind: "free" },
  getAnalyticsConsent: { handler: "lib/api/analytics-consent.ts", kind: "free" },
  updateAnalyticsConsent: { handler: "lib/api/analytics-consent.ts", kind: "free" },
} as const;

export const operationProviderSpend = {
  addKeywords: deferred("lib/api/keyword-create.ts", ["rank_check"]),
  aiTrackingSuggestionsGenerate: inline("lib/api/ai-tracking-suggestions.ts", ["ai_tracking"]),
  analyzeAiVisibility: inline("lib/api/ai-research.ts", ["ai_visibility"], estimateOnly()),
  analyzeBacklinks: inline(
    "lib/api/backlinks.ts",
    ["backlinks"],
    estimateOnly("BacklinksEstimate"),
  ),
  analyzeDomainOverview: inline(
    "lib/api/domain-overview.ts",
    ["domain_overview"],
    estimateOnly("DomainOverviewEstimate"),
  ),
  bulkUpdateKeywords: deferred("lib/api/keyword-bulk.ts", ["rank_check"]),
  compareAiPrompts: inline("lib/api/ai-research.ts", ["prompt_explorer"], estimateOnly()),
  createAiTrackingRun: deferred("lib/api/ai-tracking.ts", ["ai_tracking"]),
  createAiTrackingSchedule: deferred("lib/api/ai-tracking.ts", ["ai_tracking"]),
  getKeywordMetrics: inline(
    "lib/api/keyword-research.ts",
    ["keyword_metrics"],
    estimateOnly("KeywordMetricsResponse"),
  ),
  listRankedKeywordSuggestions: inline("lib/api/ranked-keywords.ts", ["ranked_keywords"]),
  loadDomainOverviewHistory: inline("lib/api/domain-overview.ts", ["domain_overview"]),
  loadDomainOverviewKeywords: inline("lib/api/domain-overview.ts", ["domain_overview"]),
  loadDomainOverviewPages: inline("lib/api/domain-overview.ts", ["domain_overview"]),
  loadMoreBacklinkRows: inline(
    "lib/api/backlinks.ts",
    ["backlinks"],
    estimateOnly("BacklinksRowsEstimate"),
  ),
  researchKeywords: inline(
    "lib/api/keyword-research.ts",
    ["keyword_research"],
    estimateOnly("KeywordResearchEstimate"),
  ),
  retryAiTrackingRun: deferred("lib/api/ai-tracking.ts", ["ai_tracking"]),
  // Runs inline when no scheduler is configured, otherwise queues the check.
  runRankCheck: inline("lib/api/rank-check-request.ts", ["rank_check"]),
  // A schedule or frequency in the patch can enable recurring checks.
  setKeywordTargetUrl: deferred("lib/api/keywords.ts", ["rank_check"]),
  updateAiTrackingSchedule: deferred("lib/api/ai-tracking.ts", ["ai_tracking"]),
  // The project default schedule applies to every keyword without its own.
  updateProjectDefaults: deferred("lib/api/project-defaults.ts", ["rank_check"]),
} as const satisfies Record<string, OperationProviderSpend>;

/** Billed features no REST operation starts: local scans run from the app and their schedules. */
export const nonApiProviderFeatures: readonly ProviderRequestFeature[] = ["local_scan"];

/**
 * Modules that queue provider-billed work for a worker. A deferred operation's handler must reach
 * one for each of its features.
 */
export const deferredSpendAnchors: Partial<Record<ProviderRequestFeature, readonly string[]>> = {
  ai_tracking: ["lib/ai-tracking/admission/launch.ts"],
  rank_check: ["lib/rank-check/dispatcher-state.ts"],
};

export type PaidOperationId = keyof typeof operationProviderSpend;

export function operationSpend(operationId: string): OperationProviderSpend | undefined {
  return (operationProviderSpend as Record<string, OperationProviderSpend>)[operationId];
}
