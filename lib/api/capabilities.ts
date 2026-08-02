import { alertRuleToolSchema } from "@/lib/alerts/tool-schema";
import { JITTER_MINUTES_MAX, JITTER_MINUTES_MIN } from "@/lib/schemas/keyword";
import {
  DEFAULT_SERP_DEPTH,
  DEFAULT_SERP_DEVICE,
  DEFAULT_SERP_MARKET,
  SERP_ENGINE,
  serpDepthValues,
  serpDeviceValues,
  serpMarketOptions,
} from "@/lib/serp/markets";
import { apiKeyCreateProperties } from "./api-key-contract";
import { API_VERSION_HEADER, getApiVersionCapabilities } from "./api-versions";
import { cloudImportCapabilitySchemas } from "./cloud-import-capabilities";
import { loopClosureToolInputSchemas } from "./loop-closure-capabilities";
import { getOpenApiDocument } from "./openapi";
import { COST_ESTIMATE_MAX_KEYWORDS, COST_ESTIMATE_MAX_LOCATIONS } from "./public-cost";
import { savedViewCapabilitySchemas } from "./saved-view-capabilities";

const projectToolSchema = {
  properties: { api_key: { type: "string" }, project_id: { type: "string" } },
  required: ["api_key", "project_id"],
  type: "object",
} as const;

function projectMemberToolSchema(memberName: string) {
  return {
    properties: {
      api_key: { type: "string" },
      [memberName]: { type: "string" },
      project_id: { type: "string" },
    },
    required: ["api_key", "project_id", memberName],
    type: "object",
  } as const;
}

const serpMarketSchema = { enum: serpMarketOptions, type: "string" } as const;
const serpDeviceSchema = { enum: serpDeviceValues, type: "string" } as const;
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

const toolInputSchemas = {
  addKeywords: {
    properties: {
      api_key: { type: "string" },
      country: { ...serpMarketSchema, default: DEFAULT_SERP_MARKET },
      device: { ...serpDeviceSchema, default: DEFAULT_SERP_DEVICE },
      keywords: { items: { type: "string" }, minItems: 1, type: "array" },
      project_id: { type: "string" },
      schedule: scheduleSchema,
      target_url: { type: ["string", "null"] },
    },
    required: ["api_key", "project_id", "keywords"],
    type: "object",
  },
  createApiKey: {
    properties: { api_key: { type: "string" }, ...apiKeyCreateProperties },
    required: ["api_key", "name"],
    type: "object",
  },
  estimateSerpCost: {
    properties: {
      devices: { default: 1, enum: [1, 2], type: "integer" },
      frequency: { default: "daily", enum: ["daily", "weekly", "monthly"], type: "string" },
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
      api_key: { type: "string" },
      // Omitted country and device are a no-op for schedule-only updates.
      country: serpMarketSchema,
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
      project_id: { type: "string" },
      serp_stop_on_match: { type: "boolean" },
      timezone: { type: "string" },
    },
    required: ["api_key", "project_id"],
    type: "object",
  },
  getRankCheckResult: {
    properties: { api_key: { type: "string" }, check_id: { type: "string" } },
    required: ["api_key", "check_id"],
    type: "object",
  },
  listKeywords: {
    properties: {
      api_key: { type: "string" },
      country: serpMarketSchema,
      device: serpDeviceSchema,
      limit: { maximum: 200, minimum: 1, type: "integer" },
      project_id: { type: "string" },
      search: { type: "string" },
    },
    required: ["api_key", "project_id"],
    type: "object",
  },
  createSignal: {
    properties: {
      api_key: { type: "string" },
      happened_at: { format: "date-time", type: "string" },
      keyword_id: { type: "string" },
      payload: { additionalProperties: true, type: "object" },
      severity: { default: "info", enum: ["info", "warning", "critical"], type: "string" },
      source: { enum: ["deploy", "cms", "api"], type: "string" },
      type: { pattern: String.raw`^[a-z_]+\.[a-z_]+$`, type: "string" },
      url: { format: "uri", type: "string" },
    },
    required: ["api_key", "source", "type"],
    type: "object",
  },
  listSignals: {
    properties: {
      api_key: { type: "string" },
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
    required: ["api_key", "project_id"],
    type: "object",
  },
  runRankCheck: {
    properties: { api_key: { type: "string" }, keyword_id: { type: "string" } },
    required: ["api_key", "keyword_id"],
    type: "object",
  },
  setKeywordTargetUrl: {
    properties: {
      api_key: { type: "string" },
      keyword_id: { type: "string" },
      target_url: { type: ["string", "null"] },
    },
    required: ["api_key", "keyword_id", "target_url"],
    type: "object",
  },
  listAlertRules: projectToolSchema,
  createAlertRule: alertRuleToolSchema({ includeApiKey: true }),
  updateAlertRule: alertRuleToolSchema({ includeApiKey: true, update: true }),
  deleteAlertRule: projectMemberToolSchema("rule_id"),
  listTriggeredAlerts: projectToolSchema,
  ...loopClosureToolInputSchemas,
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
  addCompetitor: projectToolSchema,
  removeCompetitor: projectMemberToolSchema("competitor_id"),
  getNotificationPreferences: projectToolSchema,
  updateNotificationPreferences: projectToolSchema,
  listMigrationTokens: projectToolSchema,
  mintMigrationToken: projectToolSchema,
  revokeMigrationToken: projectMemberToolSchema("token_id"),
  ...cloudImportCapabilitySchemas,
} as const;

type ToolName = keyof typeof toolInputSchemas;

const toolNames = Object.keys(toolInputSchemas) as ToolName[];
const operationIdByToolName: Partial<Record<ToolName, string>> = {
  disableSitemapMonitor: "updateSitemapMonitor",
  enableSitemapMonitor: "updateSitemapMonitor",
  estimateSerpCost: "getCostEstimate",
};

function operationsById() {
  const paths = getOpenApiDocument().paths;
  const operations = new Map<string, { summary?: string }>();

  for (const methods of Object.values(paths)) {
    for (const operation of Object.values(methods)) {
      const maybeOperation = operation as { operationId?: string; summary?: string };
      if (maybeOperation.operationId) {
        operations.set(maybeOperation.operationId, maybeOperation);
      }
    }
  }

  return operations;
}

export function getCapabilities() {
  const operations = operationsById();

  return toolNames.map((name) => {
    const operationId = operationIdByToolName[name] ?? name;

    return {
      description: operations.get(operationId)?.summary ?? operationId,
      input_schema: toolInputSchemas[name],
      name,
      operationId,
    };
  });
}

// Keep `/api/v1/llms.txt` distinct from the site-level `/llms.txt` agent entry point.
export function getLlmsText() {
  const { apiVersions } = getApiVersionCapabilities();
  const capabilities = getCapabilities()
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join("\n");

  return [
    "# bisibility API v1",
    "",
    "Machine-readable API capability summary. For the site and agent entry point,",
    "see /llms.txt.",
    "",
    "Base URL: /api/v1",
    `API versions: ${apiVersions.join(", ")}.`,
    `Optional declaration: ${API_VERSION_HEADER}: ${apiVersions[0]}.`,
    "Auth: Authorization: Bearer <api_key>.",
    "Exception: cloud-import operations authenticate only with Authorization: Bearer mig_.... Request bodies never carry credentials. GET /cloud/import/compatibility is public.",
    "Errors use application/problem+json. Lists use data/meta.next_cursor.",
    "",
    "Resources: projects, keywords, rank-checks, signals, api-keys, alert-rules, triggered-alerts, team, providers, saved-views, competitors, notification-preferences, migration-tokens, cloud-import.",
    "",
    "Tools:",
    capabilities,
    "",
    `SERP: ${SERP_ENGINE.label}, default market ${DEFAULT_SERP_MARKET}, default device ${DEFAULT_SERP_DEVICE}, default depth Top ${DEFAULT_SERP_DEPTH}.`,
    `Supported SERP depths: ${serpDepthValues.join(", ")}.`,
    "",
    "Example: GET /api/v1/projects/{project_id}/keywords?limit=50",
  ].join("\n");
}
