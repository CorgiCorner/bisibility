import type { SdkOperationExtensions } from "./openapi-sdk-operations";

const names = {
  getPageIndexingReport: [
    "pageIndexing",
    "report",
    "get_page_indexing_report",
    "GetPageIndexingReport",
  ],
  listPageIndexingUrls: ["pageIndexing", "urls", "list_page_indexing_urls", "ListPageIndexingUrls"],
  getPageIndexingSettings: [
    "pageIndexing",
    "getSettings",
    "get_page_indexing_settings",
    "GetPageIndexingSettings",
  ],
  updatePageIndexingSettings: [
    "pageIndexing",
    "updateSettings",
    "update_page_indexing_settings",
    "UpdatePageIndexingSettings",
  ],

  createAlertRule: ["alertRules", "create", "create_alert_rule", "CreateAlertRule"],
  updateAlertRule: ["alertRules", "update", "update_alert_rule", "UpdateAlertRule"],
  deleteAlertRule: ["alertRules", "delete", "delete_alert_rule", "DeleteAlertRule"],
  muteTriggeredAlert: ["alerts", "mute", "mute_triggered_alert", "MuteTriggeredAlert"],
  markProjectAlertsRead: [
    "alerts",
    "markAllRead",
    "mark_project_alerts_read",
    "MarkProjectAlertsRead",
  ],
  previewPromptTrackerRun: [
    "promptTracker.runs",
    "preview",
    "preview_prompt_tracker_run",
    "PreviewPromptTrackerRun",
  ],
  createPromptTrackerRun: [
    "promptTracker.runs",
    "create",
    "create_prompt_tracker_run",
    "CreatePromptTrackerRun",
  ],
  getPromptTrackerRun: [
    "promptTracker.runs",
    "get",
    "get_prompt_tracker_run",
    "GetPromptTrackerRun",
  ],
  listPromptTrackerSamples: [
    "promptTracker.runs",
    "samples",
    "list_prompt_tracker_samples",
    "ListPromptTrackerSamples",
  ],
  runSiteAudit: ["siteAudits", "run", "run_site_audit", "RunSiteAudit"],
  listSiteAudits: ["siteAudits", "list", "list_site_audits", "ListSiteAudits"],
  getSiteAudit: ["siteAudits", "get", "get_site_audit", "GetSiteAudit"],
  listSearchIndexSitemaps: [
    "searchIndex.sitemaps",
    "list",
    "list_search_index_sitemaps",
    "ListSearchIndexSitemaps",
  ],
  getSearchIndexSitemap: [
    "searchIndex.sitemaps",
    "get",
    "get_search_index_sitemap",
    "GetSearchIndexSitemap",
  ],
  inspectSearchIndexUrls: [
    "searchIndex",
    "inspectUrls",
    "inspect_search_index_urls",
    "InspectSearchIndexUrls",
  ],
  listSearchPerformanceQueryStats: [
    "analytics.searchPerformance",
    "list",
    "list_search_performance_query_stats",
    "ListSearchPerformanceQueryStats",
  ],
} as const;

const reads = new Set([
  "getPageIndexingReport",
  "listPageIndexingUrls",
  "getPageIndexingSettings",

  "getPromptTrackerRun",
  "listPromptTrackerSamples",
  "listSiteAudits",
  "getSiteAudit",
  "listSearchPerformanceQueryStats",
  "listSearchIndexSitemaps",
  "getSearchIndexSitemap",
]);

export const sdkWave3Operations: Record<string, SdkOperationExtensions> = Object.fromEntries(
  Object.entries(names).map(([id, [group, method, python, go]]) => [
    id,
    {
      "x-bisibility-sdk": { group, method, legacy: { ts: [id], python: [python], go: [go] } },
      "x-bisibility-idempotency":
        id === "createPromptTrackerRun" ? "required" : reads.has(id) ? "none" : "optional",
      "x-bisibility-pagination":
        id === "listPromptTrackerSamples" || id === "listPageIndexingUrls"
          ? { style: "cursor", items: "data", next: "meta.next_cursor", max_limit: 100 }
          : { style: "none" },
    },
  ]),
);

export const sdkWave3ReadyOperationIds = Object.keys(names);
