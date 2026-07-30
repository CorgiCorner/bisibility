import { mcpPublicIdSchema } from "./public-id-schema";

type JsonObject = Record<string, unknown>;

const stringSchema = { type: "string" };
const idempotency = { idempotency_key: stringSchema };

function objectSchema(properties: JsonObject = {}, required: string[] = []) {
  return { properties, required, type: "object" };
}

export const agentMcpSchemas = {
  exportRankHistory: objectSchema(
    {
      cursor: stringSchema,
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
      connection_id: mcpPublicIdSchema("conn"),
      end_date: { format: "date", type: "string" },
      limit: { maximum: 1_000, minimum: 1, type: "integer" },
      project_id: mcpPublicIdSchema("prj"),
      query: stringSchema,
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
    ["project_id", "monitor_id"],
  ),
} satisfies Record<string, JsonObject>;
