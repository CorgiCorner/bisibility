import { serpDeviceValues, serpMarketOptions } from "@/lib/serp/markets";
import { publicIdSchema } from "./openapi-public-id";
import {
  jitterMinutesContractSchema,
  scheduleTimezoneContractSchema,
} from "./openapi-schedule-schema";

const serpMarketSchema = { enum: serpMarketOptions, example: "United States", type: "string" };
const serpDeviceSchema = { enum: serpDeviceValues, type: "string" };
const locationKeySchema = { example: "ES/Andalusia/Malaga@en", type: "string" };

export const projectSchemas = {
  Project: {
    properties: {
      created_at: { format: "date-time", type: "string" },
      domain: { type: "string" },
      id: publicIdSchema("prj"),
      name: { type: "string" },
      updated_at: { format: "date-time", type: "string" },
      write_mode: { enum: ["active", "migration_hold", "migrated"], type: "string" },
    },
    required: ["id", "name", "domain", "created_at", "updated_at", "write_mode"],
    type: "object",
  },
  ProjectDefaults: {
    properties: {
      city: { type: ["string", "null"] },
      country: {
        ...serpMarketSchema,
        description: "Persisted default country for new keywords.",
      },
      cron_expression: { type: ["string", "null"] },
      device: {
        ...serpDeviceSchema,
        description: "Persisted default device for new keywords and moved default-market keywords.",
      },
      frequency: {
        enum: ["paused", "manual", "daily", "weekly", "monthly", "custom_cron"],
        type: "string",
      },
      jitter_minutes: jitterMinutesContractSchema,
      last_checked_at: { format: "date-time", type: ["string", "null"] },
      location_key: {
        ...locationKeySchema,
        description: "Persisted canonical location key for the default market.",
      },
      next_check_at: { format: "date-time", type: ["string", "null"] },
      project_id: publicIdSchema("prj"),
      serp_depth: { enum: [10, 20, 50, 100], type: "integer" },
      serp_stop_on_match: {
        description: "Stops a SERP crawl after the tracked domain is found.",
        type: "boolean",
      },
      source: {
        description: "How the effective default market was selected.",
        enum: ["derived", "explicit", "fallback"],
        type: "string",
      },
      timezone: scheduleTimezoneContractSchema,
      updated_at: { format: "date-time", type: ["string", "null"] },
    },
    required: [
      "project_id",
      "country",
      "city",
      "device",
      "frequency",
      "cron_expression",
      "timezone",
      "jitter_minutes",
      "last_checked_at",
      "location_key",
      "next_check_at",
      "serp_depth",
      "serp_stop_on_match",
      "source",
    ],
    type: "object",
  },
  ProjectDefaultsPatch: {
    properties: {
      city: { type: ["string", "null"] },
      country: {
        ...serpMarketSchema,
        description:
          "Optional country selector when location_key is omitted. Provide together with device.",
      },
      cron_expression: { type: ["string", "null"] },
      device: {
        ...serpDeviceSchema,
        description:
          "Optional device selector. Provide with country when location_key is omitted; with location_key it overrides the current default device.",
      },
      frequency: {
        enum: ["paused", "manual", "daily", "weekly", "monthly", "custom_cron"],
        type: "string",
      },
      jitter_minutes: jitterMinutesContractSchema,
      location_key: {
        ...locationKeySchema,
        description:
          "Updates the default market from a canonical location key. Country and city are resolved from the location catalog; device defaults to the current default device when omitted.",
      },
      serp_stop_on_match: {
        description: "Set false to fetch the full configured depth for competitor snapshots.",
        type: "boolean",
      },
      timezone: scheduleTimezoneContractSchema,
    },
    required: [],
    type: "object",
  },
  ProjectOverview: {
    properties: {
      average_position: {
        description: "Mean current position among keywords with ranked observations.",
        type: ["number", "null"],
      },
      average_position_delta: {
        description: "Previous mean position minus current mean position.",
        type: ["number", "null"],
      },
      keywords_added_this_month: { minimum: 0, type: "integer" },
      last_check_at: { format: "date-time", type: ["string", "null"] },
      next_check_at: { format: "date-time", type: ["string", "null"] },
      position_distribution: {
        items: {
          properties: {
            count: { minimum: 0, type: ["integer", "null"] },
            max: { minimum: 1, type: "integer" },
            min: { minimum: 1, type: "integer" },
          },
          required: ["min", "max", "count"],
          type: "object",
        },
        type: "array",
      },
      project_id: publicIdSchema("prj"),
      top_3_count: { minimum: 0, type: ["integer", "null"] },
      top_10_count: { minimum: 0, type: ["integer", "null"] },
      top_10_delta: { type: ["integer", "null"] },
      top_100_count: { minimum: 0, type: ["integer", "null"] },
      tracked_keyword_count: { minimum: 0, type: "integer" },
      visibility: {
        description: "Volume-weighted visibility percentage.",
        maximum: 100,
        minimum: 0,
        type: ["number", "null"],
      },
      visibility_delta: {
        description: "Visibility change in percentage points.",
        type: ["number", "null"],
      },
    },
    required: [
      "project_id",
      "tracked_keyword_count",
      "keywords_added_this_month",
      "average_position",
      "average_position_delta",
      "top_3_count",
      "top_10_count",
      "top_10_delta",
      "top_100_count",
      "visibility",
      "visibility_delta",
      "position_distribution",
      "last_check_at",
      "next_check_at",
    ],
    type: "object",
  },
};
