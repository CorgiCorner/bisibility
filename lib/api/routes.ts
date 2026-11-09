import "server-only";

import {
  createApiKey,
  createProjectApiKey,
  listApiKeys,
  listProjectApiKeys,
  revokeApiKey,
} from "./api-keys";
import type { ApiContext } from "./context";
import { domainVerification } from "./domain-verification";
import { bulkKeywords } from "./keyword-bulk";
import { createKeywords } from "./keyword-create";
import { deleteKeyword, getKeyword, listKeywords, patchKeyword } from "./keywords";
import { type ApiOperationId, operationPolicy } from "./operation-policy";
import { getProjectDefaults, updateProjectDefaults } from "./project-defaults";
import { getProjectOverview } from "./project-overview";
import { createProject, deleteProject, getProject, listProjects, updateProject } from "./projects";
import { requireApiPathPublicIds } from "./public-id";
import { getRankCheck, listRankChecks, runRankCheck } from "./rank-checks";
import { keywordResearchRoute } from "./routes-keyword-research";
import { localMonitorReadRoute } from "./routes-local-monitors";
import { researchWorkspaceRoute } from "./routes-research-workspace";

type Handler = (ctx: ApiContext) => Response | Promise<Response | null | undefined> | null;

// The router has already matched method/path and applied the operation policy.
// Keep the existing eager imports eager and every existing lazy import literal.
const handlers = {
  getDomainVerification: (ctx) => domainVerification(ctx, "read"),
  issueDomainVerification: (ctx) => domainVerification(ctx, "issue"),
  checkDomainVerification: (ctx) => domainVerification(ctx, "check"),
  listProjects,
  createProject,
  getProject: (ctx) => getProject(ctx, ctx.path[1]),
  deleteProject: (ctx) => deleteProject(ctx, ctx.path[1]),
  updateProject: (ctx) => updateProject(ctx, ctx.path[1]),
  listKeywords: (ctx) => listKeywords(ctx, ctx.path[1]),
  addKeywords: (ctx) => createKeywords(ctx, ctx.path[1]),
  bulkUpdateKeywords: bulkKeywords,
  getKeyword: (ctx) => getKeyword(ctx, ctx.path[1]),
  setKeywordTargetUrl: (ctx) => patchKeyword(ctx, ctx.path[1]),
  deleteKeyword: (ctx) => deleteKeyword(ctx, ctx.path[1]),
  getRankCheckResult: (ctx) => getRankCheck(ctx, ctx.path[1]),
  listRankChecks: (ctx) => listRankChecks(ctx, ctx.path[1]),
  runRankCheck: (ctx) => runRankCheck(ctx, ctx.path[1]),
  listApiKeys,
  createApiKey,
  revokeApiKey: (ctx) => revokeApiKey(ctx, ctx.path[1]),
  listProjectApiKeys: (ctx) => listProjectApiKeys(ctx, ctx.path[1]),
  createProjectApiKey: (ctx) => createProjectApiKey(ctx, ctx.path[1]),
  getProjectDefaults: (ctx) => getProjectDefaults(ctx, ctx.path[1]),
  updateProjectDefaults: (ctx) => updateProjectDefaults(ctx, ctx.path[1]),
  getProjectOverview: (ctx) => getProjectOverview(ctx, ctx.path[1]),
  createSignal: (ctx) => import("./signals").then((routes) => routes.createSignalForProject(ctx)),
  listSignals: (ctx) =>
    import("./signals").then((routes) => routes.listProjectSignals(ctx, ctx.path[1])),
  listAlertRules: (ctx) =>
    import("./alerts").then((routes) => routes.listAlertRules(ctx, ctx.path[1])),
  createAlertRule: (ctx) =>
    import("./alerts").then((routes) => routes.createAlertRuleForProject(ctx, ctx.path[1])),
  updateAlertRule: (ctx) =>
    import("./alerts").then((routes) => routes.updateAlertRuleById(ctx, ctx.path[1])),
  deleteAlertRule: (ctx) =>
    import("./alerts").then((routes) => routes.deleteAlertRuleById(ctx, ctx.path[1])),
  listTriggeredAlerts: (ctx) =>
    import("./alerts").then((routes) => routes.listTriggeredAlerts(ctx, ctx.path[1])),
  markProjectAlertsRead: (ctx) =>
    import("./alerts").then((routes) => routes.markProjectTriggeredAlertsRead(ctx, ctx.path[1])),
  muteTriggeredAlert: (ctx) =>
    import("./alerts").then((routes) =>
      routes.muteProjectTriggeredAlert(ctx, ctx.path[1], ctx.path[3]),
    ),
  listCompetitors: (ctx) =>
    import("./competitors").then((routes) => routes.listProjectCompetitors(ctx, ctx.path[1])),
  addCompetitor: (ctx) =>
    import("./competitors").then((routes) => routes.addProjectCompetitor(ctx, ctx.path[1])),
  removeCompetitor: (ctx) =>
    import("./competitors").then((routes) => routes.removeProjectCompetitor(ctx, ctx.path[1])),
  removeProjectCompetitor: (ctx) =>
    import("./competitors").then((routes) =>
      routes.removeProjectCompetitor(ctx, ctx.path[3], ctx.path[1]),
    ),
  listMigrationTokens: (ctx) =>
    import("./migration-tokens").then((routes) => routes.listMigrationTokens(ctx, ctx.path[1])),
  mintMigrationToken: (ctx) =>
    import("./migration-tokens").then((routes) =>
      routes.mintProjectMigrationToken(ctx, ctx.path[1]),
    ),
  revokeMigrationToken: (ctx) =>
    import("./migration-tokens").then((routes) =>
      routes.revokeProjectMigrationToken(ctx, ctx.path[1]),
    ),
  revokeProjectMigrationToken: (ctx) =>
    import("./migration-tokens").then((routes) =>
      routes.revokeProjectMigrationToken(ctx, ctx.path[3], ctx.path[1]),
    ),
  getNotificationPreferences: (ctx) =>
    import("./notification-prefs").then((routes) =>
      routes.getProjectNotificationPreferences(ctx, ctx.path[1]),
    ),
  updateNotificationPreferences: (ctx) =>
    import("./notification-prefs").then((routes) =>
      routes.updateProjectNotificationPreferences(ctx, ctx.path[1]),
    ),
  listProviderBudgets: (ctx) =>
    import("./provider-budgets").then((routes) => routes.listProviderBudgets(ctx, ctx.path[1])),
  updateProviderBudgets: (ctx) =>
    import("./provider-budgets").then((routes) =>
      routes.updateProviderBudgets(ctx, ctx.path[1], ctx.path[3]),
    ),
  listProviders: (ctx) =>
    import("./providers").then((routes) => routes.listProviders(ctx, ctx.path[1])),
  connectProvider: (ctx) =>
    import("./providers").then((routes) =>
      routes.connectProviderForProject(ctx, ctx.path[1], ctx.path[3]),
    ),
  testProviderConnection: (ctx) =>
    import("./providers").then((routes) =>
      routes.testProviderForProject(ctx, ctx.path[1], ctx.path[3]),
    ),
  updateProviderSettings: (ctx) =>
    import("./providers").then((routes) =>
      routes.updateProviderSettings(ctx, ctx.path[1], ctx.path[3]),
    ),
  disconnectProvider: (ctx) =>
    import("./providers").then((routes) =>
      routes.disconnectProviderForProject(ctx, ctx.path[1], ctx.path[3]),
    ),
  listRankedKeywordSuggestions: (ctx) =>
    import("./ranked-keywords").then((routes) =>
      routes.listRankedKeywordSuggestions(ctx, ctx.path[1]),
    ),
  listSavedKeywords: (ctx) =>
    import("./saved-keywords").then((routes) => routes.listProjectSavedKeywords(ctx, ctx.path[1])),
  createSavedKeywords: (ctx) =>
    import("./saved-keywords").then((routes) =>
      routes.createProjectSavedKeywords(ctx, ctx.path[1]),
    ),
  deleteProjectSavedKeyword: (ctx) =>
    import("./saved-keywords").then((routes) =>
      routes.deleteProjectSavedKeyword(ctx, ctx.path[3], ctx.path[1]),
    ),
  listSavedViews: (ctx) =>
    import("./saved-views").then((routes) => routes.listProjectSavedViews(ctx, ctx.path[1])),
  createSavedView: (ctx) =>
    import("./saved-views").then((routes) => routes.createProjectSavedView(ctx, ctx.path[1])),
  deleteSavedView: (ctx) =>
    import("./saved-views").then((routes) => routes.deleteProjectSavedView(ctx, ctx.path[1])),
  deleteProjectSavedView: (ctx) =>
    import("./saved-views").then((routes) =>
      routes.deleteProjectSavedView(ctx, ctx.path[3], ctx.path[1]),
    ),
  listWebhookEndpoints: (ctx) =>
    import("./webhooks").then((routes) => routes.listWebhooks(ctx, ctx.path[1])),
  createWebhookEndpoint: (ctx) =>
    import("./webhooks").then((routes) => routes.createWebhook(ctx, ctx.path[1])),
  updateWebhookEndpoint: (ctx) =>
    import("./webhooks").then((routes) => routes.updateWebhook(ctx, ctx.path[1], ctx.path[3])),
  deleteWebhookEndpoint: (ctx) =>
    import("./webhooks").then((routes) => routes.deleteWebhook(ctx, ctx.path[1], ctx.path[3])),
  listTeamMembers: (ctx) =>
    import("./team").then((routes) => routes.listTeamMembers(ctx, ctx.path[1])),
  listTeamInvites: (ctx) =>
    import("./team").then((routes) => routes.listTeamInvites(ctx, ctx.path[1])),
  createTeamInvite: (ctx) =>
    import("./team").then((routes) => routes.createTeamInvite(ctx, ctx.path[1])),
  revokeTeamInvite: (ctx) =>
    import("./team").then((routes) => routes.revokeTeamInvite(ctx, ctx.path[2])),
  revokeProjectTeamInvite: (ctx) =>
    import("./team").then((routes) => routes.revokeTeamInvite(ctx, ctx.path[4], ctx.path[1])),
  updateTeamMemberRole: (ctx) =>
    import("./team").then((routes) => routes.updateTeamMemberRole(ctx, ctx.path[4], ctx.path[1])),
  removeTeamMember: (ctx) =>
    import("./team").then((routes) => routes.deleteTeamMember(ctx, ctx.path[4], ctx.path[1])),
  resendTeamInvite: (ctx) =>
    import("./team").then((routes) => routes.resendTeamInvite(ctx, ctx.path[4], ctx.path[1])),
  analyzeBacklinks: (ctx) =>
    import("./backlinks").then((routes) => routes.getBacklinks(ctx, ctx.path[1])),
  loadMoreBacklinkRows: (ctx) =>
    import("./backlinks").then((routes) => routes.postBacklinkRows(ctx, ctx.path[1])),
  analyzeDomainOverview: (ctx) =>
    import("./domain-overview").then((routes) =>
      routes.postDomainOverviewAnalyze(ctx, ctx.path[1]),
    ),
  loadDomainOverviewHistory: (ctx) =>
    import("./domain-overview").then((routes) =>
      routes.postDomainOverviewHistory(ctx, ctx.path[1]),
    ),
  loadDomainOverviewKeywords: (ctx) =>
    import("./domain-overview").then((routes) =>
      routes.postDomainOverviewKeywords(ctx, ctx.path[1]),
    ),
  loadDomainOverviewPages: (ctx) =>
    import("./domain-overview").then((routes) => routes.postDomainOverviewPages(ctx, ctx.path[1])),
  listStoredResearchReports: (ctx) =>
    import("./research-reports").then((routes) =>
      routes.listStoredResearchReports(ctx, ctx.path[1]),
    ),
  getStoredResearchReport: (ctx) =>
    import("./research-reports").then((routes) =>
      routes.getStoredResearchReport(ctx, ctx.path[1], ctx.path[4]),
    ),
  listTrafficSnapshots: (ctx) =>
    import("./analytics").then((routes) => routes.listTrafficSnapshots(ctx, ctx.path[1])),
  getSearchPerformanceTotals: (ctx) =>
    import("./analytics-totals").then((routes) =>
      routes.getSearchPerformanceTotals(ctx, ctx.path[1]),
    ),
  listSearchPerformanceQueryStats: (ctx) =>
    import("./analytics").then((routes) =>
      routes.listSearchPerformanceQueryStats(ctx, ctx.path[1]),
    ),
  syncProjectTraffic: (ctx) =>
    import("./analytics").then((routes) => routes.syncProjectTrafficApi(ctx, ctx.path[1])),
  getPageIndexingReport: pageIndexing,
  listPageIndexingUrls: pageIndexing,
  getPageIndexingSettings: pageIndexing,
  updatePageIndexingSettings: pageIndexing,
  listSearchIndexSitemaps: searchIndex,
  getSearchIndexSitemap: searchIndex,
  inspectSearchIndexUrls: searchIndex,
  listRankCheckRuns: (ctx) =>
    import("./rank-check-runs").then((routes) => routes.listProjectRankCheckRuns(ctx, ctx.path[1])),
  getRankCheckRun: (ctx) =>
    import("./rank-check-runs").then((routes) =>
      routes.getProjectRankCheckRun(ctx, ctx.path[1], ctx.path[3]),
    ),
  exportRankHistory: (ctx) =>
    import("./rank-history-export").then((routes) => routes.exportRankHistory(ctx, ctx.path[1])),
  listSitemapMonitors: (ctx) =>
    import("./sitemap-monitors").then((routes) => routes.listSitemapMonitors(ctx, ctx.path[1])),
  updateSitemapMonitor: (ctx) =>
    import("./sitemap-monitors").then((routes) =>
      routes.updateSitemapMonitor(ctx, ctx.path[1], ctx.path[3]),
    ),
} satisfies Partial<Record<ApiOperationId, Handler>>;

function pageIndexing(ctx: ApiContext) {
  return import("./page-indexing").then((routes) =>
    routes.pageIndexingApi(ctx, ctx.path[1], ctx.path[3]),
  );
}

function searchIndex(ctx: ApiContext) {
  return import("./search-index").then((routes) =>
    routes.searchIndexApi(ctx, ctx.path[1], ctx.path[4]),
  );
}

/** Internal: operationId must be the policy result for this request, after authorization. */
export function dispatchRoute(ctx: ApiContext, operationId: string) {
  requireApiPathPublicIds(ctx.path);
  if (!Object.hasOwn(operationPolicy, operationId)) return null;
  // The static bulk route shadows member routes even for unsupported methods.
  if (
    ctx.path[0] === "keywords" &&
    ctx.path[1] === "bulk" &&
    ctx.path.length === 2 &&
    ctx.method !== "POST"
  )
    return null;
  return (
    researchWorkspaceRoute(ctx) ??
    localMonitorReadRoute(ctx) ??
    keywordResearchRoute(ctx) ??
    (Object.hasOwn(handlers, operationId)
      ? handlers[operationId as keyof typeof handlers](ctx)
      : null)
  );
}
