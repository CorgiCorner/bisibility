import { KEYWORD_TEXT_MAX } from "@/lib/schemas/keyword";
import type { schemas } from "./openapi-components";
import { withRequiredBody } from "./openapi-operations";
import { publicIdSchema } from "./openapi-public-id";
import { KEYWORD_MATCH_MAX_TEXTS } from "./schemas";

type BearerOperation = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
  parameters?: object[],
) => Record<string, unknown>;

type KeywordPathHelpers = {
  bearer: BearerOperation;
  keywordListParameters: object[];
  list: (schema: object) => object;
  ref: (name: keyof typeof schemas) => object;
};

export const keywordMatchSchemas = {
  KeywordMatch: {
    properties: {
      keyword_id: publicIdSchema("kw"),
      latest_position: { type: ["integer", "null"] },
      matched_text: {
        description: "Trimmed, lowercase request text used to match this keyword.",
        example: "headless cms",
        type: "string",
      },
      market: { $ref: "#/components/schemas/KeywordMatchMarket" },
      previous_position: { type: ["integer", "null"] },
      ranking_url: {
        description:
          "URL that ranked at `latest_position` in the last completed check, or null when the keyword has no completed check.",
        type: ["string", "null"],
      },
      text: {
        description:
          "Stored keyword text, which can differ from matched_text in case and whitespace.",
        example: "Headless CMS",
        type: "string",
      },
    },
    required: [
      "keyword_id",
      "matched_text",
      "text",
      "market",
      "latest_position",
      "previous_position",
      "ranking_url",
    ],
    type: "object",
  },
  KeywordMatchMarket: {
    properties: {
      country_code: { example: "US", type: "string" },
      device: { enum: ["desktop", "mobile"], type: "string" },
      location: { example: "United States", type: "string" },
      location_key: { example: "US/Texas/Austin", type: "string" },
    },
    required: ["location", "location_key", "country_code", "device"],
    type: "object",
  },
  KeywordMatchRequest: {
    properties: {
      texts: {
        items: { maxLength: KEYWORD_TEXT_MAX, minLength: 1, type: "string" },
        maxItems: KEYWORD_MATCH_MAX_TEXTS,
        minItems: 1,
        type: "array",
      },
    },
    required: ["texts"],
    type: "object",
  },
  KeywordMatchResponse: {
    properties: {
      data: {
        items: { $ref: "#/components/schemas/KeywordMatch" },
        type: "array",
      },
      meta: {
        properties: {
          truncated_texts: {
            description:
              "Normalized texts with more than 100 matching markets. Their returned rows are partial.",
            items: { type: "string" },
            type: "array",
          },
        },
        required: ["truncated_texts"],
        type: "object",
      },
    },
    required: ["data", "meta"],
    type: "object",
  },
};

export function keywordPaths({ bearer, keywordListParameters, list, ref }: KeywordPathHelpers) {
  const matchOperation = bearer(
    "Match exact tracked keyword texts across project markets",
    "matchProjectKeywords",
    ref("KeywordMatchResponse"),
    ref("KeywordMatchRequest"),
  );

  return {
    "/keywords/{id}": {
      delete: bearer("Delete one keyword", "deleteKeyword", ref("Keyword")),
      get: bearer("Get one keyword", "getKeyword", ref("Keyword")),
      patch: bearer("Set keyword target URL or metadata", "setKeywordTargetUrl", ref("Keyword")),
    },
    "/keywords/bulk": {
      post: bearer("Bulk mutate keywords", "bulkUpdateKeywords", { type: "object" }),
    },
    "/projects/{project_id}/keyword-matches": {
      post: withRequiredBody(matchOperation),
    },
    "/projects/{project_id}/keywords": {
      get: bearer(
        "List project keywords",
        "listKeywords",
        list(ref("Keyword")),
        undefined,
        keywordListParameters,
      ),
      post: bearer("Add one or more keywords", "addKeywords", { type: "object" }),
    },
  };
}
