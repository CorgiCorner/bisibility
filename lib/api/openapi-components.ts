import { serpDeviceValues, serpMarketOptions } from "@/lib/serp/markets";
import { apiKeyCreateProperties } from "./api-key-contract";
import { agentSchemas } from "./openapi-agent-components";
import { alertRuleSchemas } from "./openapi-alert-components";
import { keywordResearchSchemas } from "./openapi-keyword-research-components";
import { keywordMatchSchemas } from "./openapi-keywords";
import { migrationSchemas } from "./openapi-migration-components";
import { personalAccessSchemas } from "./openapi-pat-components";
import { projectSchemas } from "./openapi-project-components";
import { publicIdSchema } from "./openapi-public-id";
import {
  jitterMinutesContractSchema,
  scheduleInputContractSchema,
  scheduleTimezoneContractSchema,
} from "./openapi-schedule-schema";
import { signalSchemas } from "./openapi-signal-components";

const serpMarketSchema = { enum: serpMarketOptions, example: "United States", type: "string" };
const serpDeviceSchema = { enum: serpDeviceValues, type: "string" };
const publicIdPattern = "^[a-z]+_[a-z][a-z0-9]{23}$";
const locationKeySchema = { example: "US/Texas/Austin", type: "string" };
const keywordLocationSchema = {
  description: "Resolved keyword location display name.",
  example: "Austin, Texas, United States",
  type: "string",
};
const keywordScheduleResourceSchema = {
  properties: {
    cron_expression: { type: ["string", "null"] },
    frequency: {
      enum: ["paused", "manual", "daily", "weekly", "monthly", "custom_cron"],
      type: "string",
    },
    jitter_minutes: jitterMinutesContractSchema,
    last_checked_at: { format: "date-time", type: ["string", "null"] },
    next_check_at: { format: "date-time", type: ["string", "null"] },
    timezone: scheduleTimezoneContractSchema,
  },
  required: [
    "frequency",
    "cron_expression",
    "timezone",
    "jitter_minutes",
    "last_checked_at",
    "next_check_at",
  ],
  type: ["object", "null"],
};

export const schemas = {
  PublicIdV3: {
    description:
      "Opaque v3 public resource ID. Internal database IDs are never accepted or returned.",
    pattern: publicIdPattern,
    type: "string",
  },
  ...migrationSchemas,
  ...keywordMatchSchemas,
  ...keywordResearchSchemas,
  ...personalAccessSchemas,
  ...signalSchemas,
  ...alertRuleSchemas,
  ApiKey: {
    properties: {
      created_at: { format: "date-time", type: "string" },
      expires_at: { format: "date-time", type: ["string", "null"] },
      id: {
        example: "key_a00000000000000000000000",
        pattern: "^key_[a-z][a-z0-9]{23}$",
        type: "string",
      },
      last_used_at: { type: ["string", "null"], format: "date-time" },
      name: { type: "string" },
      prefix: { example: "bsb_key_live_xxxxxxxx", type: "string" },
      revoked_at: { type: ["string", "null"], format: "date-time" },
      scope: { enum: ["read", "write", "admin"], type: "string" },
    },
    required: [
      "id",
      "name",
      "prefix",
      "created_at",
      "expires_at",
      "last_used_at",
      "revoked_at",
      "scope",
    ],
    type: "object",
  },
  ApiKeyCreate: {
    properties: apiKeyCreateProperties,
    required: ["name"],
    type: "object",
  },
  ApiKeyIssued: {
    allOf: [
      { $ref: "#/components/schemas/ApiKey" },
      {
        properties: {
          masked_value: { type: "string" },
          token: { example: "bsb_key_live_...", type: "string" },
        },
        required: ["masked_value", "token"],
        type: "object",
      },
    ],
  },
  Keyword: {
    properties: {
      country: keywordLocationSchema,
      created_at: { format: "date-time", type: "string" },
      device: serpDeviceSchema,
      id: {
        example: "kw_a00000000000000000000000",
        pattern: "^kw_[a-z][a-z0-9]{23}$",
        type: "string",
      },
      intent: { type: ["string", "null"] },
      latest_position: { type: ["integer", "null"] },
      location: keywordLocationSchema,
      previous_position: { type: ["integer", "null"] },
      project_id: {
        example: "prj_a00000000000000000000000",
        pattern: "^prj_[a-z][a-z0-9]{23}$",
        type: "string",
      },
      ranking_url: { type: ["string", "null"] },
      schedule: keywordScheduleResourceSchema,
      tags: { items: { type: "string" }, type: "array" },
      target_url: { type: ["string", "null"] },
      text: { example: "rank tracker api", type: "string" },
      topic: { type: ["string", "null"] },
      updated_at: { format: "date-time", type: "string" },
    },
    required: [
      "id",
      "project_id",
      "text",
      "country",
      "location",
      "device",
      "latest_position",
      "previous_position",
      "ranking_url",
      "schedule",
      "tags",
      "target_url",
      "topic",
      "intent",
      "created_at",
      "updated_at",
    ],
    type: "object",
  },
  KeywordCreateItem: {
    properties: {
      city: { type: ["string", "null"] },
      country: serpMarketSchema,
      device: serpDeviceSchema,
      intent: { type: ["string", "null"] },
      keyword: { example: "rank tracker api", type: "string" },
      location: { ...serpMarketSchema, description: "Backward-compatible alias for country." },
      location_key: {
        ...locationKeySchema,
        description:
          "Canonical country, region, or city key. Takes precedence over country/location/city.",
      },
      schedule: scheduleInputContractSchema,
      tags: { items: { type: "string" }, type: "array" },
      target_url: { type: ["string", "null"] },
      topic: { type: ["string", "null"] },
    },
    required: ["keyword"],
    type: "object",
  },
  KeywordCreateResponse: {
    properties: {
      created: { type: "integer" },
      results: {
        items: {
          properties: {
            keyword: { $ref: "#/components/schemas/Keyword" },
            status: { enum: ["created", "skipped"], type: "string" },
            warning: { type: "string" },
          },
          required: ["status", "keyword"],
          type: "object",
        },
        type: "array",
      },
      skipped: { type: "integer" },
      warnings: { items: { type: "string" }, type: "array" },
    },
    required: ["created", "skipped", "results"],
    type: "object",
  },
  KeywordPatch: {
    properties: {
      city: { type: ["string", "null"] },
      country: serpMarketSchema,
      device: serpDeviceSchema,
      frequency: {
        enum: ["paused", "manual", "daily", "weekly", "monthly", "custom_cron"],
        type: "string",
      },
      intent: { type: ["string", "null"] },
      keyword: { example: "rank tracker docs", type: "string" },
      location: { ...serpMarketSchema, description: "Backward-compatible alias for country." },
      location_key: locationKeySchema,
      schedule: scheduleInputContractSchema,
      tags: { items: { type: "string" }, type: "array" },
      target_url: { type: ["string", "null"] },
      topic: { type: ["string", "null"] },
    },
    required: [],
    type: "object",
  },
  Problem: {
    properties: {
      detail: { type: "string" },
      docs_url: { type: "string" },
      errors: {},
      instance: { type: "string" },
      status: { type: "integer" },
      title: { type: "string" },
      type: { type: "string" },
    },
    required: ["type", "title", "status", "detail", "instance", "docs_url"],
    type: "object",
  },
  Provider: {
    properties: {
      category_id: { enum: ["serp", "analytics"], type: "string" },
      category_title: { type: "string" },
      connection_id: {
        pattern: "^conn_[a-z][a-z0-9]{23}$",
        type: "string",
      },
      enabled: { type: "boolean" },
      id: { description: "Natural provider catalog ID.", type: "string" },
      kind: { enum: ["serp", "analytics"], type: "string" },
      name: { type: "string" },
      primary: { type: "boolean" },
      priority: { type: "integer" },
      status: { type: "string" },
    },
    required: ["category_id", "category_title", "id", "kind", "name", "status"],
    type: "object",
  },
  ...agentSchemas,
  ...projectSchemas,
  RankCheck: {
    properties: {
      attempts: {
        description: "Provider fallback attempts recorded before the final rank-check status.",
        items: {
          properties: {
            message: { type: "string" },
            provider: { type: "string" },
          },
          required: ["provider", "message"],
          type: "object",
        },
        type: ["array", "null"],
      },
      checked_at: { format: "date-time", type: "string" },
      cost_cents: { type: ["number", "null"] },
      error: { type: ["string", "null"] },
      id: publicIdSchema("check"),
      keyword_id: publicIdSchema("kw"),
      position: { type: ["integer", "null"] },
      previous_position: { type: ["integer", "null"] },
      provider: { type: "string" },
      ranking_url: { type: ["string", "null"] },
      status: { enum: ["completed", "failed", "running"], type: "string" },
    },
    required: [
      "id",
      "keyword_id",
      "checked_at",
      "position",
      "previous_position",
      "provider",
      "ranking_url",
      "cost_cents",
      "attempts",
      "error",
      "status",
    ],
    type: "object",
  },
};

export function ref(name: keyof typeof schemas) {
  return { $ref: `#/components/schemas/${name}` };
}
