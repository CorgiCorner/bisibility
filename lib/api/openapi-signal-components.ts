import { publicIdSchema } from "./openapi-public-id";

export const signalSourceValues = [
  "rank_tracker",
  "search_analytics",
  "url_inspection",
  "sitemap",
  "deploy",
  "cms",
  "search_engine_status",
  "manual",
  "api",
] as const;

export const signalSeverityValues = ["info", "warning", "critical"] as const;

const payloadSchema = {
  additionalProperties: true,
  description: "JSON object payload. Ingestion rejects serialized payloads above 8KB.",
  type: "object",
} as const;

export const signalSchemas = {
  Signal: {
    properties: {
      created_at: { format: "date-time", type: "string" },
      happened_at: { format: "date-time", type: "string" },
      id: publicIdSchema("sig"),
      keyword_id: { ...publicIdSchema("kw"), type: ["string", "null"] },
      payload: { ...payloadSchema, type: ["object", "null"] },
      project_id: publicIdSchema("prj"),
      public_id: publicIdSchema("sig"),
      severity: { enum: signalSeverityValues, type: "string" },
      source: { enum: signalSourceValues, type: "string" },
      type: {
        example: "deploy.completed",
        pattern: String.raw`^[a-z_]+\.[a-z_]+$`,
        type: "string",
      },
      url: { format: "uri", type: ["string", "null"] },
    },
    required: [
      "id",
      "public_id",
      "project_id",
      "keyword_id",
      "source",
      "type",
      "severity",
      "url",
      "payload",
      "happened_at",
      "created_at",
    ],
    type: "object",
  },
  SignalCreate: {
    properties: {
      happened_at: {
        description: "ISO-8601 date-time when the signal happened. Defaults to now.",
        format: "date-time",
        type: "string",
      },
      keyword_id: publicIdSchema("kw"),
      payload: payloadSchema,
      severity: { default: "info", enum: signalSeverityValues, type: "string" },
      source: { enum: ["deploy", "cms", "api"], type: "string" },
      type: {
        example: "deploy.completed",
        pattern: String.raw`^[a-z_]+\.[a-z_]+$`,
        type: "string",
      },
      url: { format: "uri", type: "string" },
    },
    required: ["source", "type"],
    type: "object",
  },
};
