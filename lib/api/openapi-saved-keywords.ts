import { canonicalKeySchema, KEYWORD_TEXT_MAX } from "@/lib/schemas/keyword";
import { z } from "zod";
import { publicIdSchema } from "./openapi-public-id";
import { openEnum, sdkName, shorthandUnion, usdCents, usdNumber } from "./openapi-sdk-schema";

const nullableInteger = { type: ["integer", "null"] };

export const savedKeywordSchema = {
  ...sdkName("SavedKeyword"),
  properties: {
    cpc: { type: ["number", "null"], ...usdNumber },
    difficulty: nullableInteger,
    id: publicIdSchema("svkw"),
    intent: { type: ["string", "null"] },
    location: { type: "string" },
    saved_at: { format: "date-time", type: "string" },
    source_seed: { type: ["string", "null"] },
    text: { type: "string" },
    trend: {
      items: {
        ...sdkName("SavedKeywordTrendPoint"),
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
  ...sdkName("SavedKeywordInputItem"),
  ...shorthandUnion("SavedKeywordInput"),
  oneOf: [
    { maxLength: KEYWORD_TEXT_MAX, minLength: 1, type: "string" },
    {
      ...sdkName("SavedKeywordInput"),
      properties: {
        cpc_cents: { ...nullableInteger, minimum: 0, ...usdCents },
        difficulty: { maximum: 100, minimum: 0, type: ["integer", "null"] },
        intent: { type: ["string", "null"], minLength: 1, maxLength: 80 },
        keyword: { maxLength: 180, minLength: 1, type: "string" },
        location: z.toJSONSchema(canonicalKeySchema, { io: "input" }),
        search_volume: { ...nullableInteger, minimum: 0 },
        source_seed: { type: ["string", "null"], minLength: 1, maxLength: KEYWORD_TEXT_MAX },
        variant_count: { minimum: 0, type: "integer" },
      },
      required: ["keyword"],
      type: "object",
    },
  ],
};

export const savedKeywordsInputSchema = {
  ...sdkName("SavedKeywordsInput"),
  properties: {
    keywords: { items: savedKeywordItemSchema, maxItems: 500, minItems: 1, type: "array" },
  },
  required: ["keywords"],
  type: "object",
};

export const savedKeywordsCreateResponseSchema = {
  ...sdkName("SavedKeywordsCreateResult"),
  properties: {
    duplicate_count: { type: "integer" },
    results: {
      items: {
        ...sdkName("SavedKeywordCreateItemResult"),
        properties: {
          keyword: { type: "string" },
          status: {
            enum: ["created", "skipped"],
            type: "string",
            ...openEnum("SavedKeywordCreateStatus"),
          },
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
      get: bearerOperation(
        "List saved keywords",
        "listSavedKeywords",
        { ...list(savedKeywordSchema), ...sdkName("SavedKeywordList") },
        undefined,
        [{ $ref: "#/components/parameters/Cursor" }, { $ref: "#/components/parameters/Limit" }],
      ),
      post: {
        ...createdBearerOperation(
          "Save keywords without tracking them",
          "createSavedKeywords",
          savedKeywordsCreateResponseSchema,
          savedKeywordsInputSchema,
        ),
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
      },
    },
    "/projects/{project_id}/saved-keywords/{saved_keyword_id}": {
      delete: bearerOperation(
        "Delete a saved keyword",
        "deleteProjectSavedKeyword",
        {
          ...sdkName("SavedKeywordDeleteResult"),
          type: "object",
          properties: { removed_count: { type: "integer", minimum: 0 } },
          required: ["removed_count"],
        },
        undefined,
        [
          { in: "path", name: "saved_keyword_id", required: true, schema: publicIdSchema("svkw") },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
      ),
    },
  };
}
