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
import { keywordCheckStateSchemas, keywordMatchSchemas } from "./openapi-keywords";
import { migrationSchemas } from "./openapi-migration-components";
import { personalAccessSchemas } from "./openapi-pat-components";
import { projectSchemas } from "./openapi-project-components";
import { providerSchemas } from "./openapi-provider-components";
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
    source: {
      description:
        "Whether these schedule values come from the keyword's own row or from the project defaults.",
      enum: ["keyword", "project_default"],
      type: "string",
    },
    timezone: scheduleTimezoneContractSchema,
  },
  required: [
    "frequency",
    "cron_expression",
    "timezone",
    "jitter_minutes",
    "last_checked_at",
    "next_check_at",
    "source",
  ],
  type: ["object", "null"],
};
// biome-ignore format: grouped fields keep the central schema below the enforced line limit.
const keywordResourceRequiredFields = [
  "id", "project_id", "text", "country", "location", "device", "latest_check",
  "latest_position", "latest_successful_check", "language_code", "language_label",
  "location_key", "previous_position", "ranking_url", "schedule", "tags", "target_url",
  "topic", "intent", "created_at", "updated_at",
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
  ...keywordCheckStateSchemas,
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
      latest_check: { $ref: "#/components/schemas/KeywordLatestCheck" },
      latest_position: {
        description:
          '`latest_position` = `latest_check.position`; it is `null` when the latest executed check failed OR when the domain was not found within the requested depth. Agents that need "the last known ranking" must read `latest_successful_check.position`.',
        type: ["integer", "null"],
      },
      latest_successful_check: { $ref: "#/components/schemas/KeywordLatestSuccessfulCheck" },
      language_code: { example: "en", type: "string" },
      language_label: { example: "English", type: "string" },
      location: keywordLocationSchema,
      location_key: locationKeySchema,
      previous_position: {
        description:
          "`previous_position` = the position recorded on `latest_check` as its predecessor.",
        type: ["integer", "null"],
      },
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
  ...providerSchemas,
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
      error_code: {
        description:
          "Stable failure code for this check, or null for rows older than the code taxonomy.",
        type: ["string", "null"],
      },
      id: publicIdSchema("check"),
      keyword_id: publicIdSchema("kw"),
      position: { type: ["integer", "null"] },
      previous_position: { type: ["integer", "null"] },
      provider: { type: "string" },
      ranking_url: { type: ["string", "null"] },
      run: {
        description: "The run that produced this result, or null for a legacy row.",
        properties: {
          finished_at: { format: "date-time", type: ["string", "null"] },
          id: publicIdSchema("rcr"),
          started_at: { format: "date-time", type: ["string", "null"] },
          status: { type: "string" },
          trigger: { type: "string" },
        },
        required: ["id", "status", "trigger", "started_at", "finished_at"],
        type: ["object", "null"],
      },
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
      "run",
      "cost_cents",
      "attempts",
      "error",
      "error_code",
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
