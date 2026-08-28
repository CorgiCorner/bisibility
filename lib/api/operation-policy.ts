import * as caps from "./operation-capabilities";
import { type OperationPolicy, policy } from "./operation-policy-helpers";

export type ApiMethod = "DELETE" | "GET" | "PATCH" | "POST";
export type ProjectAccess = "read" | "write";

/**
 * Project-role requirement an operation inherits from the app authorization table.
 * The router resolves it with `canProjectAction()` so API credentials and the UI
 * answer to the same rules.
 */
export type { OperationCapability } from "./operation-capabilities";

export const operationPolicy = {
  addCompetitor: policy("POST", "/projects/{project_id}/competitors", "write"),
  addKeywords: policy("POST", "/projects/{project_id}/keywords", "write"),
  analyzeBacklinks: policy("GET", "/projects/{projectId}/backlinks", "write"),
  analyzeDomainOverview: policy("POST", "/projects/{projectId}/domain-overview/analyze", "write"),
  bulkUpdateKeywords: policy("POST", "/keywords/bulk", "write"),
  connectProvider: policy(
    "POST",
    "/projects/{project_id}/providers/{provider_id}/connect",
    "write",
    "write",
    caps.manageProviderConnection,
  ),
  createAlertRule: policy("POST", "/projects/{project_id}/alert-rules", "write"),
  createApiKey: policy("POST", "/api-keys", "admin"),
  createPersonalAccessToken: policy("POST", "/me/tokens", "admin"),
  createProject: policy("POST", "/projects", "write"),
  createProjectApiKey: policy("POST", "/projects/{project_id}/api-keys", "admin"),
  createSavedKeywords: policy("POST", "/projects/{project_id}/saved-keywords", "write"),
  createSavedView: policy("POST", "/projects/{project_id}/saved-views", "write"),
  createSignal: policy("POST", "/signals", "write"),
  createTeamInvite: policy("POST", "/projects/{project_id}/team/invites", "admin"),
  createWebhookEndpoint: policy(
    "POST",
    "/projects/{project_id}/webhooks",
    "write",
    "write",
    caps.manageWebhookEndpoint,
  ),
  deleteAlertRule: policy(
    "DELETE",
    "/alert-rules/{rule_id}",
    "write",
    "write",
    caps.deleteAlertRule,
  ),
  deleteKeyword: policy("DELETE", "/keywords/{id}", "write", "write", caps.deleteKeyword),
  deleteProject: policy("DELETE", "/projects/{project_id}", "admin", "write", caps.deleteProject),
  deleteProjectSavedKeyword: policy(
    "DELETE",
    "/projects/{project_id}/saved-keywords/{saved_keyword_id}",
    "write",
    "write",
    caps.deleteKeyword,
  ),
  deleteProjectSavedView: policy("DELETE", "/projects/{project_id}/saved-views/{view_id}", "write"),
  deleteSavedView: policy("DELETE", "/saved-views/{view_id}", "write"),
  deleteWebhookEndpoint: policy(
    "DELETE",
    "/projects/{project_id}/webhooks/{webhook_id}",
    "admin",
    "write",
    caps.manageWebhookEndpoint,
  ),
  disconnectProvider: policy(
    "DELETE",
    "/projects/{project_id}/providers/{provider_id}",
    "write",
    "write",
    caps.manageProviderConnection,
  ),
  exportRankHistory: policy("GET", "/projects/{project_id}/exports/rank-history", "read"),
  getKeyword: policy("GET", "/keywords/{id}", "read"),
  getKeywordMetrics: policy("POST", "/projects/{project_id}/keyword-metrics", "write", "read"),
  getMe: policy("GET", "/me", "read"),
  getNotificationPreferences: policy(
    "GET",
    "/projects/{project_id}/notification-preferences",
    "read",
  ),
  getProject: policy("GET", "/projects/{project_id}", "read"),
  getProjectDefaults: policy("GET", "/projects/{project_id}/defaults", "read"),
  getProjectOverview: policy("GET", "/projects/{project_id}/overview", "read"),
  getRankCheckResult: policy("GET", "/rank-checks/{check_id}", "read"),
  listAlertRules: policy("GET", "/projects/{project_id}/alert-rules", "read"),
  listApiKeys: policy("GET", "/api-keys", "admin"),
  listCompetitors: policy("GET", "/projects/{project_id}/competitors", "read"),
  listKeywords: policy("GET", "/projects/{project_id}/keywords", "read"),
  listMigrationTokens: policy("GET", "/projects/{project_id}/migration-tokens", "read"),
  listPersonalAccessTokens: policy("GET", "/me/tokens", "admin"),
  listProjectApiKeys: policy("GET", "/projects/{project_id}/api-keys", "admin"),
  listProjects: policy("GET", "/projects", "read"),
  listProviders: policy("GET", "/projects/{project_id}/providers", "read"),
  listRankChecks: policy("GET", "/keywords/{id}/rank-checks", "read"),
  listRankedKeywordSuggestions: policy(
    "GET",
    "/projects/{project_id}/ranked-keyword-suggestions",
    "write",
  ),
  listSavedKeywords: policy("GET", "/projects/{project_id}/saved-keywords", "read"),
  listSavedViews: policy("GET", "/projects/{project_id}/saved-views", "read"),
  listSearchPerformanceQueryStats: policy(
    "GET",
    "/projects/{project_id}/analytics/query-stats",
    "read",
  ),
  listSignals: policy("GET", "/projects/{project_id}/signals", "read"),
  listSitemapMonitors: policy("GET", "/projects/{project_id}/sitemap-monitors", "read"),
  listTeamInvites: policy("GET", "/projects/{project_id}/team/invites", "read"),
  listTeamMembers: policy("GET", "/projects/{project_id}/team/members", "read"),
  listTrafficSnapshots: policy("GET", "/projects/{project_id}/analytics/traffic-snapshots", "read"),
  listTriggeredAlerts: policy("GET", "/projects/{project_id}/triggered-alerts", "read"),
  listWebhookEndpoints: policy("GET", "/projects/{project_id}/webhooks", "read"),
  loadMoreBacklinkRows: policy("POST", "/projects/{projectId}/backlinks/rows", "write"),
  loadDomainOverviewHistory: policy(
    "POST",
    "/projects/{projectId}/domain-overview/history",
    "write",
  ),
  loadDomainOverviewKeywords: policy(
    "POST",
    "/projects/{projectId}/domain-overview/keywords",
    "write",
  ),
  loadDomainOverviewPages: policy("POST", "/projects/{projectId}/domain-overview/pages", "write"),
  markProjectAlertsRead: policy(
    "POST",
    "/projects/{project_id}/triggered-alerts/mark-read",
    "write",
  ),
  matchProjectKeywords: policy("POST", "/projects/{project_id}/keyword-matches", "read", "read"),
  mintMigrationToken: policy(
    "POST",
    "/projects/{project_id}/migration-tokens",
    "write",
    "write",
    caps.manageProject,
  ),
  muteTriggeredAlert: policy(
    "POST",
    "/projects/{project_id}/triggered-alerts/{alert_id}/mute",
    "write",
  ),
  removeCompetitor: policy(
    "DELETE",
    "/competitors/{competitor_id}",
    "write",
    "write",
    caps.deleteCompetitor,
  ),
  removeProjectCompetitor: policy(
    "DELETE",
    "/projects/{project_id}/competitors/{competitor_id}",
    "write",
    "write",
    caps.deleteCompetitor,
  ),
  removeTeamMember: policy("DELETE", "/projects/{project_id}/team/members/{member_id}", "admin"),
  researchKeywords: policy("GET", "/projects/{project_id}/keyword-research", "write"),
  resendTeamInvite: policy(
    "POST",
    "/projects/{project_id}/team/invites/{invite_id}/resend",
    "admin",
  ),
  revokeApiKey: policy("DELETE", "/api-keys/{key_id}", "admin"),
  revokeCurrentPersonalAccessToken: policy("DELETE", "/me/tokens/current", "read"),
  revokeMigrationToken: policy(
    "DELETE",
    "/migration-tokens/{token_id}",
    "write",
    "write",
    caps.manageProject,
  ),
  revokePersonalAccessToken: policy("DELETE", "/me/tokens/{token_id}", "admin"),
  revokeProjectMigrationToken: policy(
    "DELETE",
    "/projects/{project_id}/migration-tokens/{token_id}",
    "write",
    "write",
    caps.manageProject,
  ),
  revokeProjectTeamInvite: policy(
    "DELETE",
    "/projects/{project_id}/team/invites/{invite_id}",
    "admin",
  ),
  revokeTeamInvite: policy(
    "DELETE",
    "/team/invites/{invite_id}",
    "admin",
    "write",
    caps.manageTeam,
  ),
  runRankCheck: policy("POST", "/keywords/{id}/checks", "write"),
  searchLocations: policy("GET", "/locations/search", "read"),
  setKeywordTargetUrl: policy("PATCH", "/keywords/{id}", "write"),
  syncProjectTraffic: policy("POST", "/projects/{project_id}/analytics/sync", "write"),
  testProviderConnection: policy(
    "POST",
    "/projects/{project_id}/providers/{provider_id}/test",
    "write",
    "write",
    caps.manageProviderConnection,
  ),
  updateAlertRule: policy("PATCH", "/alert-rules/{rule_id}", "write"),
  updateMe: policy("PATCH", "/me", "write"),
  updateNotificationPreferences: policy(
    "PATCH",
    "/projects/{project_id}/notification-preferences",
    "write",
    "write",
    // Member level, like the app action: the handler escalates to
    // manage/notification_delivery_channel only when Slack or webhook flips.
    caps.updateNotificationPreference,
  ),
  updateProject: policy("PATCH", "/projects/{project_id}", "write"),
  updateProjectDefaults: policy("PATCH", "/projects/{project_id}/defaults", "write"),
  updateProviderSettings: policy(
    "PATCH",
    "/projects/{project_id}/providers/{provider_id}",
    "write",
    "write",
    caps.manageProviderConnection,
  ),
  updateSitemapMonitor: policy(
    "PATCH",
    "/projects/{project_id}/sitemap-monitors/{monitor_id}",
    "write",
  ),
  updateTeamMemberRole: policy("PATCH", "/projects/{project_id}/team/members/{member_id}", "admin"),
  updateWebhookEndpoint: policy(
    "PATCH",
    "/projects/{project_id}/webhooks/{webhook_id}",
    "write",
    "write",
    caps.manageWebhookEndpoint,
  ),
} as const satisfies Record<string, OperationPolicy>;

export type ApiOperationId = keyof typeof operationPolicy;

const policies = Object.entries(operationPolicy) as [ApiOperationId, OperationPolicy][];

function pathSegments(path: string | readonly string[]) {
  return typeof path === "string" ? path.split("/").filter(Boolean) : path;
}

function isParameter(segment: string) {
  return segment.startsWith("{") && segment.endsWith("}");
}

function pathsMatch(pattern: string, path: readonly string[]) {
  const patternSegments = pathSegments(pattern);
  return (
    patternSegments.length === path.length &&
    patternSegments.every((segment, index) => isParameter(segment) || segment === path[index])
  );
}

function staticSegmentCount(path: string) {
  return pathSegments(path).filter((segment) => !isParameter(segment)).length;
}

export function operationPolicyForRequest(
  method: string,
  path: readonly string[],
): (OperationPolicy & { operationId: ApiOperationId }) | undefined {
  const matches = policies
    .filter(([, candidate]) => candidate.method === method && pathsMatch(candidate.path, path))
    .sort(([, left], [, right]) => staticSegmentCount(right.path) - staticSegmentCount(left.path));
  const [match] = matches;
  return match ? { operationId: match[0], ...match[1] } : undefined;
}

function normalizedPath(path: string) {
  return path.replaceAll(/\{[^}]+\}/g, "{}");
}

export function assertOperationPolicy(
  operationId: string,
  method: string,
  path: string,
): asserts operationId is ApiOperationId {
  const declared = operationPolicy[operationId as ApiOperationId];
  if (!declared) {
    throw new Error(`API operation "${operationId}" is missing an operation policy`);
  }
  if (
    declared.method !== method.toUpperCase() ||
    normalizedPath(declared.path) !== normalizedPath(path)
  ) {
    throw new Error(`API operation "${operationId}" does not match its operation policy route`);
  }
}
