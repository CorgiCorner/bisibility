import { publicIdSchema } from "./openapi-public-id";

const nullableInteger = { nullable: true, type: "integer" };

export const savedKeywordSchema = {
  properties: {
    cpc: { nullable: true, type: "number" },
    difficulty: nullableInteger,
    id: publicIdSchema("svkw"),
    intent: { nullable: true, type: "string" },
    location: { type: "string" },
    saved_at: { format: "date-time", type: "string" },
    source_seed: { nullable: true, type: "string" },
    text: { type: "string" },
    trend: {
      items: {
        properties: {
          month: { maximum: 12, minimum: 1, type: "integer" },
          search_volume: nullableInteger,
          year: { type: "integer" },
        },
        required: ["month", "search_volume", "year"],
        type: "object",
      },
      type: "array",
    },
    variant_count: { type: "integer" },
    volume: nullableInteger,
  },
  required: ["id", "location", "saved_at", "text", "trend", "variant_count"],
  type: "object",
};

const savedKeywordItemSchema = {
  oneOf: [
    { maxLength: 180, minLength: 1, type: "string" },
    {
      properties: {
        cpc_cents: nullableInteger,
        difficulty: { maximum: 100, minimum: 0, nullable: true, type: "integer" },
        intent: { nullable: true, type: "string" },
        keyword: { maxLength: 180, minLength: 1, type: "string" },
        location: { type: "string" },
        search_volume: nullableInteger,
        source_seed: { nullable: true, type: "string" },
        variant_count: { minimum: 0, type: "integer" },
      },
      required: ["keyword"],
      type: "object",
    },
  ],
};

export const savedKeywordsInputSchema = {
  properties: {
    keywords: { items: savedKeywordItemSchema, maxItems: 500, minItems: 1, type: "array" },
  },
  required: ["keywords"],
  type: "object",
};

export const savedKeywordsCreateResponseSchema = {
  properties: {
    duplicate_count: { type: "integer" },
    results: {
      items: {
        properties: {
          keyword: { type: "string" },
          status: { enum: ["created", "skipped"], type: "string" },
        },
        required: ["keyword", "status"],
        type: "object",
      },
      type: "array",
    },
    saved_count: { type: "integer" },
  },
  required: ["duplicate_count", "results", "saved_count"],
  type: "object",
};

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

export function savedKeywordPaths(
  list: (schema: object) => object,
  bearerOperation: BearerOperation,
  createdBearerOperation: CreatedBearerOperation,
) {
  return {
    "/projects/{project_id}/saved-keywords": {
      get: bearerOperation("List saved keywords", "listSavedKeywords", list(savedKeywordSchema)),
      post: createdBearerOperation(
        "Save keywords without tracking them",
        "createSavedKeywords",
        savedKeywordsCreateResponseSchema,
        savedKeywordsInputSchema,
      ),
    },
    "/projects/{project_id}/saved-keywords/{saved_keyword_id}": {
      delete: bearerOperation("Delete a saved keyword", "deleteProjectSavedKeyword", {
        type: "object",
      }),
    },
  };
}
