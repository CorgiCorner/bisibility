import { paymentRequestFields, paymentResponseFields } from "./openapi-action-payment";
import { openEnum, sdkName, taggedUnion, usdCents } from "./openapi-sdk-schema";

const sourceSchema = {
  enum: ["related", "suggestion", "idea"],
  type: "string",
  ...openEnum("KeywordResearchSource"),
};

const monthlyTrend = {
  items: {
    properties: {
      month: { maximum: 12, minimum: 1, type: "integer" },
      search_volume: { type: ["number", "null"] },
      year: { type: "integer" },
    },
    required: ["year", "month", "search_volume"],
    type: "object",
    ...sdkName("MonthlySearchVolume"),
  },
  maxItems: 12,
  type: "array",
};

const metrics = {
  competition: { maximum: 1, minimum: 0, type: ["number", "null"] },
  cpc_cents: { minimum: 0, type: ["integer", "null"], ...usdCents },
  difficulty: { maximum: 100, minimum: 0, type: ["number", "null"] },
  intent: {
    enum: ["informational", "commercial", "transactional", "navigational", "unknown", null],
    ...openEnum("KeywordIntent"),
  },
  monthly_trend: monthlyTrend,
  search_volume: { minimum: 0, type: ["number", "null"] },
};

const connection = {
  properties: {
    id: { pattern: "^conn_[a-z][a-z0-9]{23}$", type: "string" },
    label: { type: "string" },
    provider: { type: "string" },
  },
  required: ["id", "label", "provider"],
  type: "object",
  ...sdkName("ResearchConnection"),
};

export const keywordResearchSchemas = {
  KeywordMetricsRequest: {
    properties: {
      ...paymentRequestFields,
      connection_id: {
        minLength: 1,
        maxLength: 120,
        pattern: "^conn_[a-z][a-z0-9]{23}$",
        type: "string",
      },
      estimate_only: { default: false, type: "boolean" },
      fresh: { default: false, type: "boolean" },
      include_clickstream: { default: false, type: "boolean" },
      keywords: {
        items: { maxLength: 80, minLength: 1, type: "string" },
        maxItems: 700,
        minItems: 1,
        type: "array",
      },
      max_cost_cents: {
        minimum: 0,
        type: "integer",
        ...usdCents,
        description:
          "0 = cached result only; missing metrics return cost_limit_exceeded with estimated_cost_cents before paid work.",
      },
    },
    required: ["keywords"],
    type: "object",
  },
  KeywordMetricsResponse: {
    properties: {
      ...paymentResponseFields,
      cached_count: { minimum: 0, type: "integer" },
      connections: { items: connection, type: "array" },
      cost_cents: { minimum: 0, type: "number", ...usdCents },
      estimate: { type: "boolean" },
      estimated_cost_cents: { minimum: 0, type: "number", ...usdCents },
      fetched_at: { format: "date-time", type: "string" },
      fetched_count: { minimum: 0, type: "integer" },
      fetched_count_estimate: { minimum: 0, type: "integer" },
      provider: { type: "string" },
      rows: {
        items: {
          ...sdkName("KeywordMetricsRow"),
          properties: { keyword: { type: "string" }, ...metrics },
          required: ["keyword", ...Object.keys(metrics)],
          type: "object",
        },
        type: "array",
      },
      total_count: { minimum: 0, type: "integer" },
    },
    required: [
      "rows",
      "total_count",
      "cached_count",
      "fetched_count",
      "cost_cents",
      "fetched_at",
      "provider",
      "connections",
    ],
    type: "object",
  },
  KeywordResearchEstimate: {
    description:
      "Free dry run returned for estimate_only=true. It carries per-source cost facts only and never rows, fetch times, or source statuses, so it cannot be mistaken for an empty result.",
    properties: {
      ...paymentResponseFields,
      cached: { description: "Every planned source is cached.", type: "boolean" },
      connections: { items: connection, type: "array" },
      cost_cents: { minimum: 0, type: "number", ...usdCents },
      estimate: { const: true, type: "boolean" },
      provider: { type: "string" },
      sources: {
        items: {
          properties: {
            cached: { type: "boolean" },
            cost_cents: { minimum: 0, type: "number", ...usdCents },
            source: sourceSchema,
          },
          required: ["source", "cost_cents", "cached"],
          type: "object",
          ...sdkName("KeywordResearchSourceEstimate"),
        },
        type: "array",
      },
    },
    required: ["estimate", "sources", "cost_cents", "cached", "provider", "connections"],
    type: "object",
  },
  KeywordResearchResponse: {
    oneOf: [
      { $ref: "#/components/schemas/KeywordResearchEstimate" },
      { $ref: "#/components/schemas/KeywordResearchResult" },
    ],
    ...taggedUnion("estimate", ["estimate", "result"]),
  },
  KeywordResearchResult: {
    properties: {
      ...paymentResponseFields,
      cached: { type: "boolean" },
      connections: { items: connection, type: "array" },
      cost_cents: { minimum: 0, type: "number", ...usdCents },
      fetched_at: { format: "date-time", type: "string" },
      provider: { type: "string" },
      rows: {
        items: {
          properties: {
            already_tracked: { type: "boolean" },
            keyword: { type: "string" },
            source: sourceSchema,
            ...metrics,
          },
          required: ["keyword", "source", "already_tracked", ...Object.keys(metrics)],
          type: "object",
          ...sdkName("KeywordResearchRow"),
        },
        type: "array",
      },
      sources: {
        items: {
          properties: {
            cached: { type: "boolean" },
            cost_cents: { minimum: 0, type: "number", ...usdCents },
            reason: {
              enum: [
                "budget_exhausted",
                "cost_limit",
                "in_progress",
                "needs_reauth",
                "no_source",
                "previous_source_failed",
                "provider_error",
                "rate_limited",
                "result_limit",
                "unsupported_location",
              ],
              type: "string",
              ...openEnum("KeywordResearchSourceReason"),
            },
            returned: { minimum: 0, type: "integer" },
            source: sourceSchema,
            status: {
              enum: ["ok", "failed", "skipped"],
              type: "string",
              ...openEnum("KeywordResearchSourceStatus"),
            },
          },
          required: ["source", "status", "returned", "cost_cents", "cached"],
          type: "object",
          ...sdkName("KeywordResearchSourceResult"),
        },
        type: "array",
      },
      total_count: { minimum: 0, type: "integer" },
    },
    required: [
      "rows",
      "sources",
      "total_count",
      "cost_cents",
      "cached",
      "fetched_at",
      "provider",
      "connections",
    ],
    type: "object",
  },
} as const;
