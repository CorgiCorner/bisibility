import { mcpPublicIdSchema } from "./public-id-schema";

const booleanSchema = { type: "boolean" };

export const keywordResearchMcpSchemas = {
  getKeywordMetrics: {
    properties: {
      connection_id: mcpPublicIdSchema("conn"),
      estimate_only: booleanSchema,
      fresh: booleanSchema,
      include_clickstream: booleanSchema,
      keywords: {
        items: { maxLength: 80, minLength: 1, type: "string" },
        maxItems: 700,
        minItems: 1,
        type: "array",
      },
      max_cost_cents: {
        minimum: 0,
        type: "integer",
        description:
          "0 = cached result only; a cache miss returns cost_limit_exceeded with estimated_cost_cents before paid work.",
      },
      project_id: mcpPublicIdSchema("prj"),
    },
    required: ["project_id", "keywords"],
    type: "object",
  },
  researchKeywords: {
    properties: {
      connection_id: mcpPublicIdSchema("conn"),
      estimate_only: booleanSchema,
      fresh: booleanSchema,
      include_clickstream: booleanSchema,
      max_cost_cents: {
        minimum: 0,
        type: "integer",
        description:
          "0 = cached result only; a cache miss returns cost_limit_exceeded with estimated_cost_cents before paid work.",
      },
      mode: { enum: ["auto", "related", "suggestions", "ideas"], type: "string" },
      project_id: mcpPublicIdSchema("prj"),
      result_limit: { enum: [100, 300, 500], type: "integer" },
      seed: { maxLength: 80, minLength: 1, type: "string" },
    },
    required: ["project_id", "seed"],
    type: "object",
  },
} as const;
