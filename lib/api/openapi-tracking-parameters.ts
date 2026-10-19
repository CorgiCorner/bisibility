import { z } from "zod";
import { trackingTrendsQuerySchema } from "./ai-tracking-query";

/**
 * App-owned REST parameters for AI tracking reads that an SDK generator consumes. These
 * operations no longer read the MCP tool input, which is built from the TS SDK and would close
 * the cycle SDK -> MCP -> spec -> SDK. `openapi-tracking-ownership.test.ts` checks that the MCP
 * tools still accept the same fields.
 */
const projectId = {
  in: "path",
  name: "project_id",
  required: true,
  schema: {
    description: "Public project ID; membership and token scope are enforced.",
    type: "string",
    pattern: "^prj_[a-z][a-z0-9]{23}$",
  },
};

/** Mirrors `trackingPageSchema`: at most 100 rows, and a bounded opaque cursor. */
const page = [
  {
    in: "query",
    name: "limit",
    required: false,
    schema: { description: "Page size, at most 100.", type: "integer", minimum: 1, maximum: 100 },
  },
  {
    in: "query",
    name: "cursor",
    required: false,
    schema: {
      description: "Opaque cursor from the previous response.",
      type: "string",
      maxLength: 512,
    },
  },
];

function zodQuery(schema: z.ZodObject) {
  const json = z.toJSONSchema(schema, { io: "input" }) as {
    properties: Record<string, unknown>;
    required?: string[];
  };
  return Object.entries(json.properties).map(([name, property]) => ({
    in: "query",
    name,
    required: Boolean(json.required?.includes(name)),
    schema: property,
  }));
}

export const appOwnedTrackingParameters = {
  getAiTrackingHistory: [projectId, ...page],
  getAiTrackingTrends: [projectId, ...zodQuery(trackingTrendsQuerySchema)],
  listAiTrackingPrompts: [projectId, ...page],
} as const satisfies Record<string, readonly object[]>;
