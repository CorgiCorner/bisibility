import { savedViewSurfaces } from "@/lib/saved-views/model";
import { publicIdSchema } from "./openapi-public-id";

const savedViewSurface = { enum: savedViewSurfaces, type: "string" };

export const savedViewSchema = {
  properties: {
    config: { type: "object" },
    id: publicIdSchema("viw"),
    name: { type: "string" },
    surface: savedViewSurface,
  },
  required: ["config", "id", "name", "surface"],
  type: "object",
};

export const savedViewInputSchema = {
  properties: {
    config: { type: "object" },
    name: { maxLength: 48, minLength: 1, type: "string" },
    surface: savedViewSurface,
  },
  required: ["config", "name"],
  type: "object",
};

export const savedViewListParameters = [
  { in: "query", name: "surface", schema: { default: "keywords", ...savedViewSurface } },
];

type BearerOperation = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
  parameters?: object[],
) => object;

type CreatedBearerOperation = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema: object,
) => object;

export function savedViewOperations(
  list: (schema: object) => object,
  bearerOperation: BearerOperation,
  createdBearerOperation: CreatedBearerOperation,
) {
  return {
    get: bearerOperation(
      "List saved views",
      "listSavedViews",
      list(savedViewSchema),
      undefined,
      savedViewListParameters,
    ),
    post: createdBearerOperation(
      "Create a saved view",
      "createSavedView",
      savedViewSchema,
      savedViewInputSchema,
    ),
  };
}
