import { publicIdSchema } from "./openapi-public-id";

const dateTime = { format: "date-time", type: "string" } as const;
const nullableDateTime = { format: "date-time", type: ["string", "null"] } as const;

export const loopClosureSchemas = {
  RankHistoryExportResponse: {
    properties: {
      data: { items: { $ref: "#/components/schemas/RankHistoryExportRow" }, type: "array" },
      meta: {
        properties: { next_cursor: { type: ["string", "null"] } },
        required: ["next_cursor"],
        type: "object",
      },
    },
    required: ["data", "meta"],
    type: "object",
  },
  RankHistoryExportRow: {
    properties: {
      checked_at: dateTime,
      id: publicIdSchema("check"),
      keyword: { type: "string" },
      keyword_id: publicIdSchema("kw"),
      position: { type: ["integer", "null"] },
      previous_position: { type: ["integer", "null"] },
      ranking_url: { type: ["string", "null"] },
    },
    required: [
      "id",
      "keyword_id",
      "keyword",
      "checked_at",
      "position",
      "previous_position",
      "ranking_url",
    ],
    type: "object",
  },
  SitemapMonitor: {
    properties: {
      enabled: { type: "boolean" },
      id: publicIdSchema("prj"),
      latest_snapshot: {
        properties: {
          fetched_at: dateTime,
          sitemap_url: { format: "uri", type: "string" },
          url_count: { minimum: 0, type: "integer" },
        },
        required: ["sitemap_url", "url_count", "fetched_at"],
        type: ["object", "null"],
      },
      project_id: publicIdSchema("prj"),
      sitemap_url: { format: "uri", type: ["string", "null"] },
      status: { enum: ["active", "disabled", "pending"], type: "string" },
    },
    required: ["id", "project_id", "enabled", "status", "sitemap_url", "latest_snapshot"],
    type: "object",
  },
  SitemapMonitorList: {
    properties: {
      data: { items: { $ref: "#/components/schemas/SitemapMonitor" }, type: "array" },
      meta: {
        properties: { next_cursor: { type: ["string", "null"] } },
        required: ["next_cursor"],
        type: "object",
      },
    },
    required: ["data", "meta"],
    type: "object",
  },
  SitemapMonitorPatch: {
    properties: { enabled: { type: "boolean" } },
    required: ["enabled"],
    type: "object",
  },
  TriggeredAlertMuteResult: {
    properties: { muted: { const: true, type: "boolean" }, snoozed_until: nullableDateTime },
    required: ["muted", "snoozed_until"],
    type: "object",
  },
  TriggeredAlertsReadResult: {
    properties: { updated: { minimum: 0, type: "integer" } },
    required: ["updated"],
    type: "object",
  },
} as const;
