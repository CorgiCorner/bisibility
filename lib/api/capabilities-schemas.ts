import { alertRuleToolSchema } from "@/lib/alerts/tool-schema";
import type { McpToolName } from "@/lib/mcp/canonical-tools";
import { JITTER_MINUTES_MAX, JITTER_MINUTES_MIN } from "@/lib/schemas/keyword";
import { DEFAULT_SERP_DEVICE, serpDeviceValues } from "@/lib/serp/constants";
import { apiKeyCreateProperties } from "./api-key-contract";
import { cloudImportCapabilitySchemas } from "./cloud-import-capabilities";
import {
  legacyMarketNameOpenApiSchema,
  primaryLocationKeyDescription,
} from "./legacy-market-input";
import { loopClosureToolInputSchemas } from "./loop-closure-capabilities";
import { COST_ESTIMATE_MAX_KEYWORDS, COST_ESTIMATE_MAX_LOCATIONS } from "./public-cost";
import { savedViewCapabilitySchemas } from "./saved-view-capabilities";

const projectToolSchema = {
  properties: { project_id: { type: "string" } },
  required: ["project_id"],
  type: "object",
} as const;

function projectMemberToolSchema(memberName: string) {
  return {
    properties: { [memberName]: { type: "string" }, project_id: { type: "string" } },
    required: ["project_id", memberName],
    type: "object",
  } as const;
}

function withoutApiKey<
  Schema extends { properties: Record<string, unknown>; required: readonly string[] },
>(schema: Schema) {
  const properties = { ...schema.properties };
  delete properties.api_key;
  const required = schema.required.filter((field) => field !== "api_key");
  return { ...schema, properties, required };
}

const loopClosureTools = {
  disableSitemapMonitor: withoutApiKey(loopClosureToolInputSchemas.disableSitemapMonitor),
  enableSitemapMonitor: withoutApiKey(loopClosureToolInputSchemas.enableSitemapMonitor),
  exportRankHistory: withoutApiKey(loopClosureToolInputSchemas.exportRankHistory),
  listSitemapMonitors: withoutApiKey(loopClosureToolInputSchemas.listSitemapMonitors),
  markProjectAlertsRead: withoutApiKey(loopClosureToolInputSchemas.markProjectAlertsRead),
  muteTriggeredAlert: withoutApiKey(loopClosureToolInputSchemas.muteTriggeredAlert),
};

const serpDeviceSchema = { enum: serpDeviceValues, type: "string" } as const;
const locationKeySchema = (detail: string) =>
  ({ description: primaryLocationKeyDescription(detail), type: "string" }) as const;
const savedViewTools = savedViewCapabilitySchemas(projectToolSchema);

const scheduleSchema = {
  properties: {
    cron_expression: { type: ["string", "null"] },
    frequency: {
      enum: ["paused", "manual", "daily", "weekly", "monthly", "custom_cron"],
      type: "string",
    },
    jitter_minutes: {
      maximum: JITTER_MINUTES_MAX,
      minimum: JITTER_MINUTES_MIN,
      type: "integer",
    },
    timezone: { type: "string" },
  },
  type: "object",
} as const;

export const toolInputSchemas = {
  addKeywords: {
    properties: {
      country: legacyMarketNameOpenApiSchema(
        "Country market name used when location_key is omitted; defaults to the project default market.",
      ),
      device: { ...serpDeviceSchema, default: DEFAULT_SERP_DEVICE },
      keywords: { items: { type: "string" }, minItems: 1, type: "array" },
      location_key: locationKeySchema("Defaults to the project default market."),
      project_id: { type: "string" },
      schedule: scheduleSchema,
      target_url: { type: ["string", "null"] },
    },
    required: ["project_id", "keywords"],
    type: "object",
  },
  createApiKey: {
    properties: { ...apiKeyCreateProperties },
    required: ["name"],
    type: "object",
  },
  estimateSerpCost: {
    properties: {
      devices: { default: 1, enum: [1, 2], type: "integer" },
      frequency: {
        default: "daily",
        enum: ["daily", "weekly", "monthly", "manual", "paused", "custom_cron"],
        type: "string",
      },
      cron_expression: { type: "string", maxLength: 120 },
      depth: { default: 100, enum: [10, 20, 50, 100], type: "integer" },
      keywords: { maximum: COST_ESTIMATE_MAX_KEYWORDS, minimum: 0, type: "integer" },
      locations: { default: 1, maximum: COST_ESTIMATE_MAX_LOCATIONS, minimum: 1, type: "integer" },
      option: { enum: ["standard", "priority", "live"], type: "string" },
      plan: { type: "string" },
      provider: { default: "dataforseo", enum: ["dataforseo", "serpapi"], type: "string" },
    },
    required: ["keywords"],
    type: "object",
  },
  updateProject: projectToolSchema,
  deleteProject: projectToolSchema,
  updateProjectDefaults: {
    properties: {
      // Omitted market fields are a no-op for schedule-only updates.
      country: legacyMarketNameOpenApiSchema(
        "Country market name when location_key is omitted; provide together with device.",
      ),
      cron_expression: { type: ["string", "null"] },
      device: serpDeviceSchema,
      frequency: {
        enum: ["paused", "manual", "daily", "weekly", "monthly", "custom_cron"],
        type: "string",
      },
      jitter_minutes: {
        maximum: JITTER_MINUTES_MAX,
        minimum: JITTER_MINUTES_MIN,
        type: "integer",
      },
      location_key: locationKeySchema("Updates the default market."),
      project_id: { type: "string" },
      serp_stop_on_match: { type: "boolean" },
      timezone: { type: "string" },
    },
    required: ["project_id"],
    type: "object",
  },
  getRankCheckResult: {
    properties: { check_id: { type: "string" } },
    required: ["check_id"],
    type: "object",
  },
  listKeywords: {
    properties: {
      country: legacyMarketNameOpenApiSchema("Country filter matched against stored labels."),
      device: serpDeviceSchema,
      limit: { maximum: 200, minimum: 1, type: "integer" },
      location_key: locationKeySchema("Filters by the exact canonical location key."),
      project_id: { type: "string" },
      search: { type: "string" },
    },
    required: ["project_id"],
    type: "object",
  },
  createSignal: {
    properties: {
      happened_at: { format: "date-time", type: "string" },
      keyword_id: { type: "string" },
      payload: { additionalProperties: true, type: "object" },
      severity: { default: "info", enum: ["info", "warning", "critical"], type: "string" },
      source: { enum: ["deploy", "cms", "api"], type: "string" },
      type: { pattern: String.raw`^[a-z_]+\.[a-z_]+$`, type: "string" },
      url: { format: "uri", type: "string" },
    },
    required: ["source", "type"],
    type: "object",
  },
  listSignals: {
    properties: {
      cursor: { type: "string" },
      from: { format: "date-time", type: "string" },
      limit: { maximum: 200, minimum: 1, type: "integer" },
      project_id: { type: "string" },
      source: {
        enum: [
          "rank_tracker",
          "search_analytics",
          "url_inspection",
          "sitemap",
          "deploy",
          "cms",
          "search_engine_status",
          "manual",
          "api",
        ],
        type: "string",
      },
      to: { format: "date-time", type: "string" },
      type: { type: "string" },
    },
    required: ["project_id"],
    type: "object",
  },
  runRankCheck: {
    properties: { keyword_id: { type: "string" } },
    required: ["keyword_id"],
    type: "object",
  },
  setKeywordTargetUrl: {
    properties: {
      keyword_id: { type: "string" },
      target_url: { type: ["string", "null"] },
    },
    required: ["keyword_id", "target_url"],
    type: "object",
  },
  listAlertRules: projectToolSchema,
  createAlertRule: alertRuleToolSchema(),
  updateAlertRule: alertRuleToolSchema({ update: true }),
  deleteAlertRule: projectMemberToolSchema("rule_id"),
  listTriggeredAlerts: projectToolSchema,
  ...loopClosureTools,
  listTeamMembers: projectToolSchema,
  listTeamInvites: projectToolSchema,
  createTeamInvite: projectToolSchema,
  revokeTeamInvite: projectMemberToolSchema("invite_id"),
  listProviders: projectToolSchema,
  connectProvider: projectMemberToolSchema("provider_id"),
  testProviderConnection: projectMemberToolSchema("provider_id"),
  updateProviderSettings: projectMemberToolSchema("provider_id"),
  disconnectProvider: projectMemberToolSchema("provider_id"),
  listSavedViews: savedViewTools.list,
  createSavedView: savedViewTools.create,
  deleteSavedView: projectMemberToolSchema("view_id"),
  listCompetitors: projectToolSchema,
  addCompetitor: {
    properties: {
      domain: {
        description: "Bare competitor domain to track, without scheme or path.",
        type: "string",
      },
      label: { maxLength: 80, type: "string" },
      project_id: { type: "string" },
    },
    required: ["project_id", "domain"],
    type: "object",
  },
  removeCompetitor: projectMemberToolSchema("competitor_id"),
  getNotificationPreferences: projectToolSchema,
  updateNotificationPreferences: projectToolSchema,
  listMigrationTokens: projectToolSchema,
  mintMigrationToken: projectToolSchema,
  revokeMigrationToken: projectMemberToolSchema("token_id"),
  ...cloudImportCapabilitySchemas,
} as const;

export type ToolName = keyof typeof toolInputSchemas;

export const mcpToolNameByCapability: Record<ToolName, McpToolName | null> = {
  addCompetitor: "add_competitor",
  addKeywords: "add_keywords",
  connectProvider: "connect_provider",
  createAlertRule: "create_alert_rule",
  createApiKey: "create_api_key",
  createCloudImportSession: null,
  createSavedView: "create_saved_view",
  createSignal: "create_signal",
  createTeamInvite: "create_team_invite",
  deleteAlertRule: "delete_alert_rule",
  deleteProject: "delete_project",
  deleteSavedView: "delete_saved_view",
  disableSitemapMonitor: "disable_sitemap_monitor",
  disconnectProvider: "disconnect_provider",
  enableSitemapMonitor: "enable_sitemap_monitor",
  estimateSerpCost: "get_cost_estimate",
  exportRankHistory: "export_rank_history",
  finalizeCloudImportSession: null,
  getCloudImportCompatibility: "get_cloud_import_compatibility",
  getNotificationPreferences: "get_notification_preferences",
  getRankCheckResult: "get_rank_check_result",
  importCloudExport: null,
  listAlertRules: "list_alert_rules",
  listCompetitors: "list_competitors",
  listKeywords: "list_keywords",
  listMigrationTokens: "list_migration_tokens",
  listProviders: "list_providers",
  listSavedViews: "list_saved_views",
  listSignals: "list_signals",
  listSitemapMonitors: "list_sitemap_monitors",
  listTeamInvites: "list_team_invites",
  listTeamMembers: "list_team_members",
  listTriggeredAlerts: "list_triggered_alerts",
  markProjectAlertsRead: "mark_project_alerts_read",
  mintMigrationToken: "mint_migration_token",
  muteTriggeredAlert: "mute_triggered_alert",
  removeCompetitor: "remove_competitor",
  revokeMigrationToken: "revoke_migration_token",
  revokeTeamInvite: "revoke_team_invite",
  runRankCheck: "run_rank_check",
  setKeywordTargetUrl: "set_keyword_target_url",
  testProviderConnection: "test_provider_connection",
  updateAlertRule: "update_alert_rule",
  updateNotificationPreferences: "update_notification_preferences",
  updateProject: "update_project",
  updateProjectDefaults: "update_project_defaults",
  updateProviderSettings: "update_provider_settings",
  uploadCloudImportChunk: null,
};
