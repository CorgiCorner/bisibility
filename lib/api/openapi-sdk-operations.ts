/**
 * Operation-level `x-bisibility-*` extensions for the SDK generator, merged into each operation
 * by `tagOpenApiPaths`. `group` and `method` are the generated namespaced surface; they follow
 * the TS SDK's existing namespaces where it has one. `legacy` lists today's public method names,
 * kept as deprecated aliases, seeded from the three SDK coverage maps.
 *
 * `sdkFirstWaveOperationIds` must pass `openapi-sdk-extensions.test.ts` in full; the other
 * operations are listed there as known gaps until they get their entries here.
 */

import { sdkWave2Operations, sdkWave2ReadyOperationIds } from "./openapi-sdk-wave2";
import { sdkWave3Operations, sdkWave3ReadyOperationIds } from "./openapi-sdk-wave3";

type Legacy = { go: string[]; python: string[]; ts: string[] };
type Pagination =
  | { style: "none" }
  | { items: string; max_limit: number; next: string; style: "cursor" };

/** `x-bisibility-cost` is not set here: `openapi-sdk-cost.ts` generates it for every operation. */
export type SdkOperationExtensions = {
  "x-bisibility-idempotency": "none" | "optional" | "required";
  "x-bisibility-pagination": Pagination;
  "x-bisibility-sdk": { group: string; legacy: Legacy; method: string; skip?: boolean };
};

const single: Pagination = { style: "none" };
const cursor = (maxLimit: number): Pagination => ({
  items: "data",
  max_limit: maxLimit,
  next: "meta.next_cursor",
  style: "cursor",
});

/** A read whose public name is the operationId in all three SDKs. */
function read(
  group: string,
  method: string,
  names: Legacy,
  pagination: Pagination = single,
): SdkOperationExtensions {
  return {
    "x-bisibility-idempotency": "none",
    "x-bisibility-pagination": pagination,
    "x-bisibility-sdk": { group, legacy: names, method },
  };
}

const legacy = (ts: string, python: string, go: string): Legacy => ({
  go: [go],
  python: [python],
  ts: [ts],
});

export const openApiSdkOperations: Partial<Record<string, SdkOperationExtensions>> = {
  getAnalyticsConsent: read("account.analyticsConsent", "get", { go: [], python: [], ts: [] }),
  updateAnalyticsConsent: {
    ...read("account.analyticsConsent", "update", { go: [], python: [], ts: [] }),
    "x-bisibility-idempotency": "optional",
  },
  registerDevicePushToken: {
    ...read("account.pushTokens", "register", { go: [], python: [], ts: [] }),
    "x-bisibility-idempotency": "optional",
  },
  listDevicePushTokens: read("account.pushTokens", "list", { go: [], python: [], ts: [] }),
  deleteDevicePushToken: {
    ...read("account.pushTokens", "delete", { go: [], python: [], ts: [] }),
    "x-bisibility-idempotency": "optional",
  },
  deleteMe: {
    ...read("account", "delete", { go: [], python: [], ts: [] }),
    "x-bisibility-idempotency": "optional",
  },
  ...sdkWave2Operations,
  ...sdkWave3Operations,
  analyzeBacklinks: read(
    "backlinks",
    "analyze",
    legacy("analyzeBacklinks", "analyze_backlinks", "AnalyzeBacklinks"),
  ),
  // POST: the router replays a repeated Idempotency-Key for 24 hours, which protects the paid
  // analysis from a retried request.
  analyzeDomainOverview: {
    ...read(
      "domainOverview",
      "analyze",
      legacy("analyzeDomainOverview", "analyze_domain_overview", "AnalyzeDomainOverview"),
    ),
    "x-bisibility-idempotency": "optional",
  },
  getAiTrackingHistory: read(
    "aiTracking",
    "history",
    legacy("getAiTrackingHistory", "get_ai_tracking_history", "GetAITrackingHistory"),
    cursor(100),
  ),
  getAiTrackingTrends: read(
    "aiTracking",
    "trends",
    legacy("getAiTrackingTrends", "get_ai_tracking_trends", "GetAITrackingTrends"),
  ),
  getCapabilities: read(
    "system",
    "getCapabilities",
    legacy("getCapabilities", "get_capabilities", "GetCapabilities"),
  ),
  getCostEstimate: read(
    "pricing",
    "estimate",
    legacy("getCostEstimate", "get_cost_estimate", "GetCostEstimate"),
  ),
  getHealth: read("system", "getHealth", legacy("getHealth", "get_health", "GetHealth")),
  getMe: read("account", "get", legacy("getMe", "get_me", "GetMe")),
  getProject: read("projects", "get", legacy("getProject", "get_project", "GetProject")),
  getProjectOverview: read(
    "analytics.overview",
    "get",
    legacy("getProjectOverview", "get_project_overview", "GetProjectOverview"),
  ),
  listAiTrackingPrompts: read(
    "aiTracking.prompts",
    "list",
    legacy("listAiTrackingPrompts", "list_ai_tracking_prompts", "ListAITrackingPrompts"),
    cursor(100),
  ),
  listAlertRules: read(
    "alertRules",
    "list",
    legacy("listAlertRules", "list_alert_rules", "ListAlertRules"),
    cursor(200),
  ),
  listCompetitors: read(
    "competitors",
    "list",
    legacy("listCompetitors", "list_competitors", "ListCompetitors"),
    cursor(200),
  ),
  listKeywords: read(
    "keywords",
    "list",
    legacy("listKeywords", "list_keywords", "ListKeywords"),
    cursor(200),
  ),
  listProjects: read(
    "projects",
    "list",
    legacy("listProjects", "list_projects", "ListProjects"),
    cursor(200),
  ),
  listRankChecks: read(
    "rankChecks",
    "list",
    legacy("listRankChecks", "list_rank_checks", "ListRankChecks"),
    cursor(200),
  ),
  listTriggeredAlerts: read(
    "alerts",
    "list",
    legacy("listTriggeredAlerts", "list_triggered_alerts", "ListTriggeredAlerts"),
    cursor(200),
  ),
  researchKeywords: read(
    "keywords",
    "research",
    legacy("researchKeywords", "research_keywords", "ResearchKeywords"),
  ),
};

/** The first operations to be generated; each must pass every extension rule. */
export const sdkFirstWaveOperationIds = [
  "getAnalyticsConsent",
  "updateAnalyticsConsent",
  "registerDevicePushToken",
  "listDevicePushTokens",
  "deleteDevicePushToken",
  "deleteMe",

  ...sdkWave2ReadyOperationIds,
  ...sdkWave3ReadyOperationIds,
  "analyzeBacklinks",
  "analyzeDomainOverview",
  "getAiTrackingHistory",
  "getAiTrackingTrends",
  "getCapabilities",
  "getCostEstimate",
  "getHealth",
  "getMe",
  "getProject",
  "getProjectOverview",
  "listAiTrackingPrompts",
  "listAlertRules",
  "listCompetitors",
  "listKeywords",
  "listProjects",
  "listRankChecks",
  "listTriggeredAlerts",
  "researchKeywords",
] as const;
