const apiKey = { type: "string" } as const;
const idempotencyKey = { type: "string" } as const;
const projectId = { type: "string" } as const;

const projectMutation = {
  properties: { api_key: apiKey, idempotency_key: idempotencyKey, project_id: projectId },
  required: ["api_key", "project_id"],
  type: "object",
} as const;

const projectRead = {
  properties: { api_key: apiKey, project_id: projectId },
  required: ["api_key", "project_id"],
  type: "object",
} as const;

const monitorMutation = {
  properties: { ...projectMutation.properties, monitor_id: { type: "string" } },
  required: ["api_key", "project_id", "monitor_id"],
  type: "object",
} as const;

export const loopClosureToolInputSchemas = {
  disableSitemapMonitor: monitorMutation,
  enableSitemapMonitor: monitorMutation,
  exportRankHistory: {
    properties: {
      api_key: apiKey,
      cursor: { type: "string" },
      granularity: { enum: ["daily", "weekly"], type: "string" },
      keyword_ids: { items: { type: "string" }, maxItems: 500, type: "array" },
      limit: { maximum: 200, minimum: 1, type: "integer" },
      project_id: projectId,
      range: { enum: ["30", "90", "all"], type: "string" },
    },
    required: ["api_key", "project_id"],
    type: "object",
  },
  listSitemapMonitors: projectRead,
  markProjectAlertsRead: projectMutation,
  muteTriggeredAlert: {
    properties: { ...projectMutation.properties, alert_id: { type: "string" } },
    required: ["api_key", "project_id", "alert_id"],
    type: "object",
  },
} as const;
