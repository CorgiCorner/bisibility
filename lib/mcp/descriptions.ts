import {
  estimatedFeatureCostCents,
  keywordMetricsRate,
  keywordResearchRate,
  rankedKeywordPageRate,
} from "@/lib/cost-estimate/provider-rates";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";

const rankedKeywordRate = rankedKeywordPageRate("dataforseo");
const rankedKeywordCost = rankedKeywordRate
  ? `about $${(rankedKeywordRate.costCents / 100).toFixed(2)} per 100-keyword page on a cache miss`
  : "a paid lookup on a cache miss";
const researchRate = keywordResearchRate("dataforseo", "related");
const metricsRate = keywordMetricsRate("dataforseo");
const researchCost = researchRate
  ? `about $${(
      estimatedFeatureCostCents(researchRate, 100, false, LIST_PROVIDER_RATE_CONTEXT) / 100
    ).toFixed(2)} per source call for 100 results`
  : "a paid lookup per source call";
const metricsCost = metricsRate
  ? `about $${(
      estimatedFeatureCostCents(metricsRate, 100, false, LIST_PROVIDER_RATE_CONTEXT) / 100
    ).toFixed(2)} per 100 fetched keywords`
  : "a paid metrics lookup";

export const descriptions: Record<string, string> = {
  bulkUpdateKeywords: "Bulk mutate keywords by tags, frequency, target URL, or deletion.",
  createPersonalToken:
    "Create a personal access token (personal-token auth only; admin scope). The raw token is returned once.",
  createProject:
    "Create a new project (personal-token auth only). Project keys cannot create projects.",
  createWebhook: "Create a webhook endpoint for a project. The HMAC secret is write-only.",
  deleteKeyword: "Delete one keyword by keyword id.",
  deleteWebhook: "Delete a webhook endpoint by id.",
  disableSitemapMonitor:
    "Disable sitemap snapshot monitoring for a project. Existing snapshots are retained.",
  enableSitemapMonitor:
    "Enable sitemap snapshot monitoring for a project. The worker performs the next scheduled sync.",
  exportRankHistory:
    "Export project rank history as capped cursor-paginated JSON. CSV streaming is available through REST only.",
  getCapabilities: "List public API capabilities exposed for agent workflows.",
  getHealth: "Read composite API, database, migration, worker, and Temporal diagnostics.",
  getKeyword: "Get one keyword and its latest rank position by keyword id.",
  get_keyword_metrics: `Write scope is required. Paid metrics lookup on the project's own DataForSEO account, ${metricsCost}. Batches contain up to 700 keywords and cache each keyword for 12 hours, shared with the API and future UI. Clickstream-refined volumes double provider cost. When cost matters, call with estimate_only first, then use max_cost_cents as a best-effort guard.`,
  getMe: "Get the authenticated user and their project memberships (personal-token auth only).",
  getProject: "Get one project by project id.",
  getRankHistory: "List historical rank checks for a keyword.",
  listApiKeys:
    "List API keys. Project keys list their own project; personal tokens pass project_id.",
  listPersonalTokens: "List personal access tokens (personal-token auth only; admin scope).",
  listProjects:
    "List projects. Project keys see the single scoped project; personal tokens see every project the user is a member of.",
  listRankChecks: "List historical rank checks for a keyword.",
  listRankedKeywordSuggestions: `Paid provider lookup on the project's own DataForSEO account, ${rankedKeywordCost}. Results are cached for 12 hours and shared with the UI and API. already_tracked marks keywords the project tracks.`,
  research_keywords: `Write scope is required. Paid keyword research on the project's own DataForSEO account, ${researchCost}. Send one seed per call. Results are cached for 12 hours and shared with the API and future UI. Clickstream-refined volumes double provider cost. already_tracked marks keywords the project tracks. When cost matters, call with estimate_only first, then use max_cost_cents as a best-effort guard.`,
  listSitemapMonitors:
    "List the project sitemap monitor with its enabled state and latest snapshot summary.",
  listSearchPerformanceQueryStats:
    "Fetch live query statistics from one of the project's own connected search-performance accounts. Provider rate limits and reauthorization rules apply.",
  listTrafficSnapshots:
    "List stored page traffic snapshots collected from the project's own connected analytics accounts, filtered by date range and optional page paths.",
  listWebhooks: "List webhook endpoints for a project.",
  markProjectAlertsRead: "Mark every firing alert in a project as acknowledged.",
  muteTriggeredAlert: "Mute one triggered alert for 24 hours without changing its firing status.",
  revokeApiKey: "Revoke an API key.",
  revokePersonalToken:
    'Revoke a personal access token by id, or pass token_id "current" to revoke the calling token.',
  resendTeamInvite: "Resend a pending team invitation and replace its expiration and token.",
  removeTeamMember:
    "Permanently remove a non-owner project member. Confirm the user's intent before calling this tool.",
  searchLocations:
    "Search canonical keyword locations. Use the returned location_key verbatim when creating or updating keywords.",
  syncProjectTraffic:
    "Synchronize traffic snapshots from the project's own connected analytics accounts now. Provider rate limits and connection authorization rules apply.",
  updateKeyword: "Update keyword metadata, target URL, tags, or schedule.",
  updateMe: "Update the authenticated user's display name (personal-token auth only).",
  updateTeamMemberRole:
    "Change a non-owner project member role to admin, member, or viewer. Ownership transfer remains UI-only.",
  updateWebhook: "Update a webhook endpoint (url, description, enabled, or rotate hmac_secret).",
};
