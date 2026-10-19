import { closedEnum, openEnum, sdkName } from "./openapi-sdk-schema";

const frequencyValues = ["paused", "manual", "daily", "weekly", "monthly", "custom_cron"];
const operationValues = ["add_tags", "delete", "remove_tags", "set_frequency", "set_target_url"];

export const keywordBulkRequest = {
  ...sdkName("KeywordBulkRequest"),
  type: "object",
  required: ["keyword_ids", "operation"],
  description:
    "Partial mutation: optional fields may be absent. target_url accepts null to clear the URL; for set_target_url, omission also clears it. Other top-level fields reject null. Tag operations require nonempty tags; set_frequency requires frequency or schedule.",
  properties: {
    frequency: { type: "string", enum: frequencyValues, ...closedEnum("KeywordBulkFrequency") },
    keyword_ids: {
      type: "array",
      minItems: 1,
      maxItems: 500,
      items: { type: "string", minLength: 1, maxLength: 160, pattern: "^kw_[a-z][a-z0-9]{23}$" },
    },
    operation: { type: "string", enum: operationValues, ...closedEnum("KeywordBulkOperation") },
    schedule: {
      ...sdkName("KeywordBulkSchedule"),
      type: "object",
      required: ["frequency"],
      properties: {
        cron_expression: { type: ["string", "null"], minLength: 1, maxLength: 120, default: null },
        frequency: { type: "string", enum: frequencyValues, ...closedEnum("KeywordBulkFrequency") },
        jitter_minutes: { type: "integer", minimum: 0, maximum: 120, default: 60 },
        serp_depth: {
          type: ["integer", "null"],
          enum: [10, 20, 50, 100, null],
          ...closedEnum("KeywordBulkSerpDepth"),
        },
        timezone: { type: "string", minLength: 1, maxLength: 80, default: "UTC" },
      },
    },
    tags: { type: "array", maxItems: 12, items: { type: "string", minLength: 1, maxLength: 48 } },
    target_url: { type: ["string", "null"], minLength: 1, maxLength: 500 },
  },
};

export const keywordBulkResponse = {
  ...sdkName("KeywordBulkResponse"),
  type: "object",
  required: ["operation", "results"],
  properties: {
    operation: { type: "string", enum: operationValues, ...openEnum("KeywordBulkResultOperation") },
    results: {
      type: "array",
      items: {
        ...sdkName("KeywordBulkResult"),
        type: "object",
        required: ["keyword_id", "status"],
        properties: {
          keyword_id: { type: "string", pattern: "^kw_[a-z][a-z0-9]{23}$" },
          status: {
            type: "string",
            enum: ["updated", "deleted", "not_found"],
            ...openEnum("KeywordBulkResultStatus"),
          },
        },
      },
    },
  },
};
