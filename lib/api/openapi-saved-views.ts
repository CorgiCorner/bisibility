import { competitorSavedViewConfigSchema } from "@/lib/competitors/saved-view-model";
import { competitorSavedViewV2Schema } from "@/lib/competitors/saved-view-v2-model";
import { savedViewConfigSchema, savedViewFiltersSchema } from "@/lib/keywords/saved-view-model";
import { keywordSavedViewV2Schema } from "@/lib/keywords/saved-view-v2-model";
import { MAX_VIEW_REVISION } from "@/lib/saved-views/canonical-model";
import { savedViewSurfaces } from "@/lib/saved-views/model";
import { z } from "zod";
import { publicIdSchema } from "./openapi-public-id";

function wireSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(wireSchema);
  if (!value || typeof value !== "object") return value;
  const snake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key === "properties" && child && typeof child === "object"
        ? Object.fromEntries(
            Object.entries(child).map(([name, schema]) => [snake(name), wireSchema(schema)]),
          )
        : key === "required" && Array.isArray(child)
          ? child.map(snake)
          : wireSchema(child),
    ]),
  );
}
// Canonical normalization transforms retain these exact object fields; they are not wire schemas.
const keywordFilterFields = savedViewFiltersSchema.out.in;
const keywordV1Definition = savedViewConfigSchema.in.extend({
  filters: keywordFilterFields,
  lens: savedViewConfigSchema.in.shape.lens.unwrap().in.unwrap(),
});
const definitionSchema = wireSchema(
  z.toJSONSchema(
    z.union([
      keywordV1Definition,
      competitorSavedViewConfigSchema,
      keywordSavedViewV2Schema.extend({ filters: keywordFilterFields }),
      competitorSavedViewV2Schema,
    ]),
    {
      io: "output",
      target: "openapi-3.0",
    },
  ),
);

const savedViewSurface = { enum: savedViewSurfaces, type: "string" };

export const savedViewSchema = {
  properties: {
    can_delete: { type: "boolean" },
    created_at: { format: "date-time", type: "string" },
    definition: definitionSchema,
    revision: { maximum: MAX_VIEW_REVISION, minimum: 1, type: "integer" },
    visibility: { enum: ["project"], type: "string" },
    config: { additionalProperties: true, type: "object" },
    id: publicIdSchema("viw"),
    name: { type: "string" },
    surface: savedViewSurface,
  },
  required: [
    "config",
    "id",
    "name",
    "surface",
    "created_at",
    "can_delete",
    "definition",
    "revision",
    "visibility",
  ],
  type: "object",
};

export const savedViewInputSchema = {
  properties: {
    config: { additionalProperties: true, type: "object" },
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
