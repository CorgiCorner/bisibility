import { savedViewSurfaces } from "@/lib/saved-views/model";
import { mcpPublicIdSchema } from "./public-id-schema";

const stringSchema = { type: "string" };
const surface = { enum: savedViewSurfaces, type: "string" };
const common = {
  cursor: stringSchema,
  limit: { maximum: 200, minimum: 1, type: "integer" },
  project_id: mcpPublicIdSchema("prj"),
  surface,
};

export const savedViewMcpSchemas = {
  create: {
    properties: {
      config: { type: "object" },
      idempotency_key: stringSchema,
      name: stringSchema,
      project_id: mcpPublicIdSchema("prj"),
      surface,
    },
    required: ["project_id", "name", "config"],
    type: "object",
  },
  list: { properties: common, required: ["project_id"], type: "object" },
};
