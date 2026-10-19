import type { schemas } from "./openapi-components";
import { publicIdSchema } from "./openapi-public-id";
import { closedEnum } from "./openapi-sdk-schema";

type Bearer = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
  parameters?: object[],
) => object;

const exportParameters = [
  {
    in: "query",
    name: "version",
    schema: { enum: ["1", "2"], default: "1", type: "string" },
    description:
      "V1 preserves legacy row/aggregation semantics. V2 returns shared qualified history and whole-scope metadata.",
  },
  {
    in: "query",
    name: "stream",
    schema: { enum: ["observations", "attempts"], default: "observations", type: "string" },
  },
  {
    in: "query",
    name: "basis",
    schema: { enum: ["observed_at", "recorded_at"], default: "recorded_at", type: "string" },
  },
  { in: "query", name: "from", schema: { format: "date-time", type: "string" } },
  { in: "query", name: "to", schema: { format: "date-time", type: "string" } },
  { in: "query", name: "aggregation", schema: { enum: ["none"], default: "none", type: "string" } },
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
    "Export project rank history as paginated JSON or complete CSV",
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
          "application/json": {
            schema: {
              anyOf: [
                input.ref("RankHistoryExportResponse"),
                input.ref("RankHistoryReportResponse"),
              ],
            },
          },
          "text/csv": { schema: { type: "string" } },
        },
        description: "Paginated JSON or complete bounded CSV rank history",
      },
    },
  };
}

export function loopClosurePaths(input: {
  bearer: Bearer;
  ref: (name: keyof typeof schemas) => object;
}) {
  return {
    "/projects/{project_id}/rank-check-runs": {
      get: {
        ...input.bearer(
          "List rank-check runs",
          "listRankCheckRuns",
          input.ref("RankCheckRunReadList"),
          undefined,
          [
            {
              in: "query",
              name: "segment",
              schema: {
                type: "string",
                enum: ["history", "planned"],
                default: "history",
                ...closedEnum("RankCheckRunSegment"),
              },
            },
            {
              in: "query",
              name: "status",
              schema: { type: "string" },
              description: "Comma-separated execution statuses.",
            },
            { in: "query", name: "cursor", schema: { type: "string" } },
            {
              in: "query",
              name: "limit",
              schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
            },
          ],
        ),
        description:
          "Read rank-check runs including cancelled or deferred outcomes without a check.",
      },
    },
    "/projects/{project_id}/rank-check-runs/{run_id}": {
      get: {
        ...input.bearer(
          "Get a rank-check run",
          "getRankCheckRun",
          input.ref("RankCheckRunRead"),
          undefined,
          [{ in: "path", name: "run_id", required: true, schema: publicIdSchema("rcr") }],
        ),
        description: "Read an existing run without launching a measurement.",
      },
    },
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
        undefined,
        [
          { in: "path", name: "alert_id", required: true, schema: publicIdSchema("al") },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
      ),
    },
    "/projects/{project_id}/triggered-alerts/mark-read": {
      post: input.bearer(
        "Mark all firing project alerts as read",
        "markProjectAlertsRead",
        input.ref("TriggeredAlertsReadResult"),
        undefined,
        [{ $ref: "#/components/parameters/IdempotencyKey" }],
      ),
    },
  };
}
