const monthlyTrend = {
  items: {
    properties: {
      month: { maximum: 12, minimum: 1, type: "integer" },
      search_volume: { type: ["number", "null"] },
      year: { type: "integer" },
    },
    required: ["year", "month", "search_volume"],
    type: "object",
  },
  maxItems: 12,
  type: "array",
};

const metrics = {
  competition: { maximum: 1, minimum: 0, type: ["number", "null"] },
  cpc_cents: { minimum: 0, type: ["integer", "null"] },
  difficulty: { maximum: 100, minimum: 0, type: ["number", "null"] },
  intent: {
    enum: ["informational", "commercial", "transactional", "navigational", "unknown", null],
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
};

export const keywordResearchSchemas = {
  KeywordMetricsRequest: {
    properties: {
      connection_id: { pattern: "^conn_[a-z][a-z0-9]{23}$", type: "string" },
      estimate_only: { default: false, type: "boolean" },
      fresh: { default: false, type: "boolean" },
      include_clickstream: { default: false, type: "boolean" },
      keywords: {
        items: { maxLength: 80, minLength: 1, type: "string" },
        maxItems: 700,
        minItems: 1,
        type: "array",
      },
      max_cost_cents: { minimum: 1, type: "integer" },
    },
    required: ["keywords"],
    type: "object",
  },
  KeywordMetricsResponse: {
    properties: {
      cached_count: { minimum: 0, type: "integer" },
      connections: { items: connection, type: "array" },
      cost_cents: { minimum: 0, type: "number" },
      estimate: { type: "boolean" },
      estimated_cost_cents: { minimum: 0, type: "number" },
      fetched_at: { format: "date-time", type: "string" },
      fetched_count: { minimum: 0, type: "integer" },
      fetched_count_estimate: { minimum: 0, type: "integer" },
      provider: { type: "string" },
      rows: {
        items: {
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
  KeywordResearchResponse: {
    properties: {
      cached: { type: "boolean" },
      connections: { items: connection, type: "array" },
      cost_cents: { minimum: 0, type: "number" },
      estimate: { type: "boolean" },
      fetched_at: { format: "date-time", type: "string" },
      provider: { type: "string" },
      rows: {
        items: {
          properties: {
            already_tracked: { type: "boolean" },
            keyword: { type: "string" },
            source: { enum: ["related", "suggestion", "idea"], type: "string" },
            ...metrics,
          },
          required: ["keyword", "source", "already_tracked", ...Object.keys(metrics)],
          type: "object",
        },
        type: "array",
      },
      sources: {
        items: {
          properties: {
            cached: { type: "boolean" },
            cost_cents: { minimum: 0, type: "number" },
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
            },
            returned: { minimum: 0, type: "integer" },
            source: { enum: ["related", "suggestion", "idea"], type: "string" },
            status: { enum: ["ok", "failed", "skipped"], type: "string" },
          },
          required: ["source", "status", "returned", "cost_cents", "cached"],
          type: "object",
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
