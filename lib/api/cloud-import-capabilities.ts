const projectId = {
  pattern: "^prj_[a-z][a-z0-9]{23}$",
  type: "string",
} as const;
const jobId = {
  pattern: "^imp_[a-z][a-z0-9]{23}$",
  type: "string",
} as const;
const checksum = {
  pattern: "^sha256:[0-9a-f]{64}$",
  type: "string",
} as const;

export const cloudImportCapabilitySchemas = {
  importCloudExport: {
    additionalProperties: false,
    properties: {
      alert_rules: { items: { type: "object" }, type: "array" },
      competitors: { items: { type: "object" }, type: "array" },
      exported_at: { format: "date-time", type: "string" },
      keywords: { items: { type: "object" }, type: "array" },
      notification_preferences: { items: { type: "object" }, type: "array" },
      project_id: projectId,
      saved_views: { items: { type: "object" }, type: "array" },
      scope: { enum: ["current", "history"], type: "string" },
      version: { const: 5, type: "integer" },
    },
    required: [
      "version",
      "project_id",
      "keywords",
      "alert_rules",
      "competitors",
      "notification_preferences",
      "saved_views",
    ],
    type: "object",
  },
  createCloudImportSession: {
    additionalProperties: false,
    properties: {
      chunk_count: { maximum: 500, minimum: 1, type: "integer" },
      source_project_id: projectId,
      totals: {
        additionalProperties: false,
        properties: {
          keywords: { minimum: 0, type: "integer" },
          rank_checks: { minimum: 0, type: "integer" },
        },
        type: "object",
      },
      version: { const: 5, type: "integer" },
    },
    required: ["version", "chunk_count", "source_project_id"],
    type: "object",
  },
  uploadCloudImportChunk: {
    additionalProperties: false,
    oneOf: [
      { properties: { kind: { const: "keywords" } }, required: ["keywords"] },
      { properties: { kind: { const: "sections" } }, required: ["sections"] },
    ],
    properties: {
      checksum,
      index: { minimum: 0, type: "integer" },
      keywords: { items: { type: "object" }, type: "array" },
      kind: { enum: ["keywords", "sections"], type: "string" },
      sections: { additionalProperties: false, type: "object" },
      session_id: jobId,
    },
    required: ["session_id", "index", "checksum", "kind"],
    type: "object",
  },
  finalizeCloudImportSession: {
    additionalProperties: false,
    properties: { session_id: jobId },
    required: ["session_id"],
    type: "object",
  },
  getCloudImportCompatibility: { additionalProperties: false, properties: {}, type: "object" },
} as const;
