import type { SdkOperationExtensions } from "./openapi-sdk-operations";

const names = {
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
  previewAiTrackingRun: [
    "aiTracking.runs",
    "preview",
    "preview_ai_tracking_run",
    "PreviewAITrackingRun",
  ],
  createAiTrackingRun: [
    "aiTracking.runs",
    "create",
    "create_ai_tracking_run",
    "CreateAITrackingRun",
  ],
  getAiTrackingRun: ["aiTracking.runs", "get", "get_ai_tracking_run", "GetAITrackingRun"],
  listAiTrackingSamples: [
    "aiTracking.runs",
    "samples",
    "list_ai_tracking_samples",
    "ListAITrackingSamples",
  ],
  runSiteAudit: ["siteAudits", "run", "run_site_audit", "RunSiteAudit"],
  listSiteAudits: ["siteAudits", "list", "list_site_audits", "ListSiteAudits"],
  getSiteAudit: ["siteAudits", "get", "get_site_audit", "GetSiteAudit"],
  listSearchPerformanceQueryStats: [
    "analytics.searchPerformance",
    "list",
    "list_search_performance_query_stats",
    "ListSearchPerformanceQueryStats",
  ],
} as const;

const reads = new Set([
  "getAiTrackingRun",
  "listAiTrackingSamples",
  "listSiteAudits",
  "getSiteAudit",
  "listSearchPerformanceQueryStats",
]);

export const sdkWave3Operations: Record<string, SdkOperationExtensions> = Object.fromEntries(
  Object.entries(names).map(([id, [group, method, python, go]]) => [
    id,
    {
      "x-bisibility-sdk": { group, method, legacy: { ts: [id], python: [python], go: [go] } },
      "x-bisibility-idempotency":
        id === "createAiTrackingRun" ? "required" : reads.has(id) ? "none" : "optional",
      "x-bisibility-pagination":
        id === "listAiTrackingSamples"
          ? { style: "cursor", items: "data", next: "meta.next_cursor", max_limit: 100 }
          : { style: "none" },
    },
  ]),
);

export const sdkWave3ReadyOperationIds = Object.keys(names);
