import { localMonitorToolSchemas } from "./local-monitor-tools";
import { mcpPublicIdSchema } from "./public-id-schema";
import { rankRunToolSchemas } from "./rank-run-tools";

type JsonObject = Record<string, unknown>;

const stringSchema = { type: "string" };
const idempotency = { idempotency_key: stringSchema };

function objectSchema(properties: JsonObject = {}, required: string[] = []) {
  return { properties, required, type: "object" };
}

export const agentMcpSchemas = {
  ...localMonitorToolSchemas,
  ...rankRunToolSchemas,
  exportRankHistory: objectSchema(
    {
      cursor: { type: "string", minLength: 1, maxLength: 8192 },
      version: { enum: ["1", "2"], type: "string" },
      stream: { enum: ["observations", "attempts"], type: "string" },
      basis: { enum: ["observed_at", "recorded_at"], type: "string" },
      from: { type: "string", format: "date-time" },
      to: { type: "string", format: "date-time" },
      aggregation: { const: "none", type: "string" },
      granularity: { enum: ["daily", "weekly"], type: "string" },
      keyword_ids: { items: mcpPublicIdSchema("kw"), maxItems: 500, type: "array" },
      limit: { maximum: 200, minimum: 1, type: "integer" },
      project_id: mcpPublicIdSchema("prj"),
      range: { enum: ["30", "90", "all"], type: "string" },
    },
    ["project_id"],
  ),
  listSitemapMonitors: objectSchema({ project_id: mcpPublicIdSchema("prj") }, ["project_id"]),
  markProjectAlertsRead: objectSchema({ ...idempotency, project_id: mcpPublicIdSchema("prj") }, [
    "project_id",
  ]),
  muteTriggeredAlert: objectSchema(
    { ...idempotency, alert_id: mcpPublicIdSchema("al"), project_id: mcpPublicIdSchema("prj") },
    ["project_id", "alert_id"],
  ),
  listSearchPerformanceQueryStats: objectSchema(
    {
      clicks_min: { maximum: Number.MAX_SAFE_INTEGER, minimum: 0, type: "integer" },
      connection_id: mcpPublicIdSchema("conn"),
      country: { maxLength: 3, minLength: 3, pattern: "^[a-zA-Z]{3}$", type: "string" },
      device: { enum: ["desktop", "mobile", "tablet"], type: "string" },
      dimensions: {
        contains: { const: "query" },
        items: { enum: ["query", "page", "country", "device"], type: "string" },
        type: "array",
      },
      end_date: { format: "date", type: "string" },
      impressions_min: { maximum: Number.MAX_SAFE_INTEGER, minimum: 0, type: "integer" },
      limit: { default: 100, maximum: 1_000, minimum: 1, type: "integer" },
      offset: { default: 0, maximum: Number.MAX_SAFE_INTEGER, minimum: 0, type: "integer" },
      page_path: { maxLength: 2_048, minLength: 1, type: "string" },
      page_path_match: { default: "contains", enum: ["contains", "prefix"], type: "string" },
      position_max: { minimum: 0, type: "number" },
      project_id: mcpPublicIdSchema("prj"),
      query: { maxLength: 1_000, minLength: 1, type: "string" },
      query_match: { default: "equals", enum: ["equals", "contains"], type: "string" },
      start_date: { format: "date", type: "string" },
    },
    ["project_id", "start_date", "end_date"],
  ),
  listTrafficSnapshots: objectSchema(
    {
      end_date: { format: "date", type: "string" },
      limit: { maximum: 200, minimum: 1, type: "integer" },
      offset: { minimum: 0, type: "integer" },
      paths: { items: stringSchema, maxItems: 50, type: "array" },
      project_id: mcpPublicIdSchema("prj"),
      start_date: { format: "date", type: "string" },
    },
    ["project_id", "start_date", "end_date"],
  ),
  listRankedKeywordSuggestions: objectSchema(
    {
      connection_id: mcpPublicIdSchema("conn"),
      fresh: { type: "boolean" },
      limit: { maximum: 100, minimum: 1, type: "integer" },
      offset: { maximum: 900, minimum: 0, multipleOf: 100, type: "integer" },
      project_id: mcpPublicIdSchema("prj"),
    },
    ["project_id"],
  ),
  removeTeamMember: objectSchema(
    {
      ...idempotency,
      member_id: mcpPublicIdSchema("mbr"),
      project_id: mcpPublicIdSchema("prj"),
    },
    ["project_id", "member_id"],
  ),
  resendTeamInvite: objectSchema(
    {
      ...idempotency,
      invite_id: mcpPublicIdSchema("inv"),
      project_id: mcpPublicIdSchema("prj"),
    },
    ["project_id", "invite_id"],
  ),
  searchLocations: objectSchema(
    {
      country: stringSchema,
      limit: { maximum: 100, minimum: 1, type: "integer" },
      q: { maxLength: 120, minLength: 2, type: "string" },
    },
    ["q"],
  ),
  syncProjectTraffic: objectSchema({ ...idempotency, project_id: mcpPublicIdSchema("prj") }, [
    "project_id",
  ]),
  updateTeamMemberRole: objectSchema(
    {
      ...idempotency,
      member_id: mcpPublicIdSchema("mbr"),
      project_id: mcpPublicIdSchema("prj"),
      role: { enum: ["admin", "member", "viewer"], type: "string" },
    },
    ["project_id", "member_id", "role"],
  ),
  updateSitemapMonitor: objectSchema(
    { ...idempotency, monitor_id: mcpPublicIdSchema("prj"), project_id: mcpPublicIdSchema("prj") },
    ["project_id"],
  ),
} satisfies Record<string, JsonObject>;
