import type { schemas } from "./openapi-components";

type Bearer = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
  parameters?: object[],
) => object;

const exportParameters = [
  { in: "query", name: "format", schema: { enum: ["csv", "json"], type: "string" } },
  {
    explode: true,
    in: "query",
    name: "keyword_id",
    schema: { items: { type: "string" }, maxItems: 500, type: "array" },
    style: "form",
  },
  {
    in: "query",
    name: "range",
    schema: { default: "30", enum: ["30", "90", "all"], type: "string" },
  },
  {
    in: "query",
    name: "granularity",
    schema: { default: "daily", enum: ["daily", "weekly"], type: "string" },
  },
  { in: "query", name: "cursor", schema: { type: "string" } },
  {
    in: "query",
    name: "limit",
    schema: { default: 50, maximum: 200, minimum: 1, type: "integer" },
  },
];

function rankHistoryOperation(input: {
  bearer: Bearer;
  ref: (name: keyof typeof schemas) => object;
}) {
  const operation = input.bearer(
    "Export project rank history as paginated JSON or streamed CSV",
    "exportRankHistory",
    input.ref("RankHistoryExportResponse"),
    undefined,
    exportParameters,
  ) as { responses: Record<string, object> };
  return {
    ...operation,
    responses: {
      ...operation.responses,
      "200": {
        content: {
          "application/json": { schema: input.ref("RankHistoryExportResponse") },
          "text/csv": { schema: { type: "string" } },
        },
        description: "Paginated JSON or streamed CSV rank history",
      },
    },
  };
}

export function loopClosurePaths(input: {
  bearer: Bearer;
  ref: (name: keyof typeof schemas) => object;
}) {
  return {
    "/projects/{project_id}/exports/rank-history": {
      get: rankHistoryOperation(input),
    },
    "/projects/{project_id}/sitemap-monitors": {
      get: input.bearer(
        "List the project sitemap monitor and latest snapshot",
        "listSitemapMonitors",
        input.ref("SitemapMonitorList"),
      ),
    },
    "/projects/{project_id}/sitemap-monitors/{monitor_id}": {
      patch: input.bearer(
        "Enable or disable the project sitemap monitor",
        "updateSitemapMonitor",
        input.ref("SitemapMonitor"),
        input.ref("SitemapMonitorPatch"),
      ),
    },
    "/projects/{project_id}/triggered-alerts/{alert_id}/mute": {
      post: input.bearer(
        "Mute one triggered alert for 24 hours",
        "muteTriggeredAlert",
        input.ref("TriggeredAlertMuteResult"),
      ),
    },
    "/projects/{project_id}/triggered-alerts/mark-read": {
      post: input.bearer(
        "Mark all firing project alerts as read",
        "markProjectAlertsRead",
        input.ref("TriggeredAlertsReadResult"),
      ),
    },
  };
}
