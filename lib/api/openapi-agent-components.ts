import { publicIdSchema } from "./openapi-public-id";

const nullableNumber = { type: ["number", "null"] };
const trafficMetrics = {
  rows_fetched: { minimum: 0, type: "integer" },
  rows_matched: { minimum: 0, type: "integer" },
  rows_upserted: { minimum: 0, type: "integer" },
  truncated: { type: "boolean" },
};

export const agentSchemas = {
  ...loopClosureSchemas,
  AnalyticsConnection: {
    properties: {
      id: { pattern: "^conn_[a-z][a-z0-9]{23}$", type: "string" },
      label: { type: "string" },
      provider: { type: "string" },
    },
    required: ["id", "label", "provider"],
    type: "object",
  },
  PageTrafficSnapshot: {
    properties: {
      bounce_rate: nullableNumber,
      created_at: { format: "date-time", type: "string" },
      date: { format: "date", type: "string" },
      engagement_rate: nullableNumber,
      key_events: nullableNumber,
      path: { type: "string" },
      provider: { type: "string" },
      scroll_depth: nullableNumber,
      sessions: { minimum: 0, type: "integer" },
      updated_at: { format: "date-time", type: "string" },
      visit_duration_seconds: nullableNumber,
      visitors: { minimum: 0, type: ["integer", "null"] },
      window_days: { minimum: 1, type: "integer" },
    },
    required: [
      "provider",
      "path",
      "date",
      "window_days",
      "sessions",
      "visitors",
      "engagement_rate",
      "bounce_rate",
      "visit_duration_seconds",
      "key_events",
      "scroll_depth",
      "created_at",
      "updated_at",
    ],
    type: "object",
  },
  PageTrafficSnapshotsResponse: {
    properties: {
      offset: { minimum: 0, type: "integer" },
      rows: { items: { $ref: "#/components/schemas/PageTrafficSnapshot" }, type: "array" },
      total_count: { minimum: 0, type: "integer" },
    },
    required: ["rows", "total_count", "offset"],
    type: "object",
  },
  SearchPerformanceQueryStat: {
    properties: {
      clicks: { minimum: 0, type: "integer" },
      ctr: { minimum: 0, type: "number" },
      impressions: { minimum: 0, type: "integer" },
      page: { type: ["string", "null"] },
      position: { minimum: 0, type: "number" },
      query: { type: "string" },
    },
    required: ["query", "clicks", "impressions", "ctr", "position"],
    type: "object",
  },
  SearchPerformanceQueryStatsResponse: {
    properties: {
      connection: { $ref: "#/components/schemas/AnalyticsConnection" },
      rows: {
        items: { $ref: "#/components/schemas/SearchPerformanceQueryStat" },
        type: "array",
      },
    },
    required: ["connection", "rows"],
    type: "object",
  },
  TrafficSyncRun: {
    properties: {
      connection_id: { pattern: "^conn_[a-z][a-z0-9]{23}$", type: "string" },
      error: { type: "string" },
      error_class: { type: "string" },
      provider: { type: "string" },
      status: {
        enum: [
          "succeeded_with_data",
          "succeeded_empty",
          "deferred_rate_limit",
          "failed",
          "not_applicable",
        ],
        type: "string",
      },
      ...trafficMetrics,
    },
    required: [
      "connection_id",
      "provider",
      "status",
      "rows_fetched",
      "rows_matched",
      "rows_upserted",
      "truncated",
    ],
    type: "object",
  },
  TrafficSyncSummary: {
    properties: {
      connections: { minimum: 0, type: "integer" },
      keyword_snapshots: { minimum: 0, type: "integer" },
      page_snapshots: { minimum: 0, type: "integer" },
      project_id: { pattern: "^prj_[a-z][a-z0-9]{23}$", type: "string" },
      runs: { items: { $ref: "#/components/schemas/TrafficSyncRun" }, type: "array" },
      skipped: {
        items: {
          properties: {
            provider: { type: "string" },
            reason: { enum: ["no_capability", "rate_limited"], type: "string" },
          },
          required: ["provider", "reason"],
          type: "object",
        },
        type: "array",
      },
    },
    required: [
      "connections",
      "keyword_snapshots",
      "page_snapshots",
      "project_id",
      "runs",
      "skipped",
    ],
    type: "object",
  },
  LocationSuggestion: {
    properties: {
      city_name: { type: ["string", "null"] },
      country_code: { minLength: 2, type: "string" },
      display_name: { type: "string" },
      hl: { type: "string" },
      kind: { enum: ["country", "region", "city"], type: "string" },
      language_label: { type: "string" },
      location_key: { example: "US/Texas/Austin", type: "string" },
      region_code: { type: ["string", "null"] },
      region_name: { type: ["string", "null"] },
    },
    required: [
      "kind",
      "display_name",
      "country_code",
      "region_code",
      "region_name",
      "city_name",
      "location_key",
      "hl",
      "language_label",
    ],
    type: "object",
  },
  LocationSuggestionsResponse: {
    properties: {
      data: { items: { $ref: "#/components/schemas/LocationSuggestion" }, type: "array" },
      meta: {
        properties: { next_cursor: { type: ["string", "null"] } },
        required: ["next_cursor"],
        type: "object",
      },
    },
    required: ["data", "meta"],
    type: "object",
  },
  RankedKeywordConnection: {
    properties: {
      id: { pattern: "^conn_[a-z][a-z0-9]{23}$", type: "string" },
      label: { type: "string" },
      provider: { enum: ["dataforseo"], type: "string" },
    },
    required: ["id", "label", "provider"],
    type: "object",
  },
  RankedKeywordSuggestion: {
    properties: {
      already_tracked: { type: "boolean" },
      estimated_traffic: { minimum: 0, type: ["number", "null"] },
      keyword: { type: "string" },
      position: { minimum: 1, type: ["integer", "null"] },
      search_volume: { minimum: 0, type: ["number", "null"] },
    },
    required: ["keyword", "position", "search_volume", "estimated_traffic", "already_tracked"],
    type: "object",
  },
  RankedKeywordSuggestionsResponse: {
    properties: {
      cached: { type: "boolean" },
      connections: {
        items: { $ref: "#/components/schemas/RankedKeywordConnection" },
        type: "array",
      },
      cost_cents: { minimum: 0, type: "number" },
      fetched_at: { format: "date-time", type: "string" },
      offset: { minimum: 0, type: "integer" },
      rows: { items: { $ref: "#/components/schemas/RankedKeywordSuggestion" }, type: "array" },
      total_count: { minimum: 0, type: ["integer", "null"] },
    },
    required: [
      "rows",
      "total_count",
      "offset",
      "cost_cents",
      "cached",
      "fetched_at",
      "connections",
    ],
    type: "object",
  },
  TeamInviteResendResult: {
    properties: {
      expires_at: { format: "date-time", type: "string" },
      id: publicIdSchema("inv"),
      invite_link: { format: "uri", type: "string" },
    },
    required: ["id", "expires_at", "invite_link"],
    type: "object",
  },
  TeamMemberMutationResult: {
    properties: { id: publicIdSchema("mbr") },
    required: ["id"],
    type: "object",
  },
  TeamMemberRolePatch: {
    properties: { role: { enum: ["admin", "member", "viewer"], type: "string" } },
    required: ["role"],
    type: "object",
  },
  TeamMemberRoleResult: {
    properties: {
      id: publicIdSchema("mbr"),
      role: { enum: ["admin", "member", "viewer"], type: "string" },
    },
    required: ["id", "role"],
    type: "object",
  },
} as const;

import { loopClosureSchemas } from "./openapi-loop-closure-components";
