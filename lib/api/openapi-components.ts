import { serpDeviceValues } from "@/lib/serp/constants";
import {
  deprecatedLegacyMarketField,
  legacyMarketNameOpenApiSchema,
  primaryLocationKeyDescription,
} from "./legacy-market-input";
import { agentSchemas } from "./openapi-agent-components";
import { alertRuleSchemas } from "./openapi-alert-components";
import { apiKeySchemas } from "./openapi-api-key-components";
import { keywordPatchSchema } from "./openapi-keyword-patch";
import { keywordResearchSchemas } from "./openapi-keyword-research-components";
import { keywordMatchSchemas } from "./openapi-keywords";
import { migrationSchemas } from "./openapi-migration-components";
import { personalAccessSchemas } from "./openapi-pat-components";
import { projectSchemas } from "./openapi-project-components";
import { publicIdSchema } from "./openapi-public-id";
import { resourceSchemas } from "./openapi-resource-components";
import {
  jitterMinutesContractSchema,
  scheduleInputContractSchema,
  scheduleTimezoneContractSchema,
} from "./openapi-schedule-schema";
import { signalSchemas } from "./openapi-signal-components";

const serpDeviceSchema = { enum: serpDeviceValues, type: "string" };
const publicIdPattern = "^[a-z]+_[a-z][a-z0-9]{23}$";
const locationKeySchema = {
  description:
    "Canonical country, region, or city key, optionally qualified with @language. The default language normalizes to the unqualified key.",
  example: "ES/Andalusia/Malaga@en",
  type: "string",
};
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
// biome-ignore format: grouped fields keep the central schema below the enforced line limit.
const keywordResourceRequiredFields = [
  "id", "project_id", "text", "country", "location", "device", "latest_position",
  "language_code", "language_label", "location_key", "previous_position", "ranking_url",
  "schedule", "tags", "target_url", "topic", "intent", "created_at", "updated_at",
];

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
  ...resourceSchemas,
  ...apiKeySchemas,
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
      language_code: { example: "en", type: "string" },
      language_label: { example: "English", type: "string" },
      location: keywordLocationSchema,
      location_key: locationKeySchema,
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
    required: keywordResourceRequiredFields,
    type: "object",
  },
  KeywordCreateItem: {
    properties: {
      city: deprecatedLegacyMarketField(
        "City name resolved within country when location_key is omitted.",
        { type: ["string", "null"] },
      ),
      country: legacyMarketNameOpenApiSchema(
        "Country market name used when location_key is omitted.",
      ),
      device: serpDeviceSchema,
      intent: { type: ["string", "null"] },
      keyword: { example: "rank tracker api", type: "string" },
      language: deprecatedLegacyMarketField(
        "SERP UI language code combined with country when location_key is omitted; use the @language qualifier on location_key instead.",
        { example: "en", type: "string" },
      ),
      location: legacyMarketNameOpenApiSchema("Backward-compatible alias for country."),
      location_key: {
        ...locationKeySchema,
        description: primaryLocationKeyDescription(
          "Takes precedence over the deprecated country, language, location, and city fields.",
        ),
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
  KeywordPatch: keywordPatchSchema,
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
      run_id: {
        ...publicIdSchema("rcr"),
        description: "Rank-check run that produced this result, or null for a legacy row.",
        type: ["string", "null"],
      },
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
      "run_id",
      "cost_cents",
      "attempts",
      "error",
      "status",
    ],
    type: "object",
  },
  // biome-ignore format: compact schema preserves the central file line cap.
  RankCheckRunQueued: { properties: { id: publicIdSchema("rcr"), status: { enum: ["queued"], type: "string" } }, required: ["id", "status"], type: "object" },
};

export function ref(name: keyof typeof schemas) {
  return { $ref: `#/components/schemas/${name}` };
}
