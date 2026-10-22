import type { schemas } from "./openapi-components";
import { withCreditsExhausted } from "./openapi-operations";
import { problemResponse } from "./openapi-problem";
import { usdCents } from "./openapi-sdk-schema";

type Bearer = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
  parameters?: object[],
) => object;

function withUnprocessable(operation: object) {
  const responses = (operation as { responses: Record<string, object> }).responses;
  return {
    ...operation,
    responses: {
      ...responses,
      "422": problemResponse("Unprocessable request"),
    },
  };
}

export function rankedKeywordSuggestionPaths(input: {
  bearer: Bearer;
  ref: (name: keyof typeof schemas) => object;
}) {
  return {
    "/projects/{project_id}/ranked-keyword-suggestions": {
      get: withCreditsExhausted(
        withUnprocessable(
          input.bearer(
            "List ranked keyword suggestions",
            "listRankedKeywordSuggestions",
            input.ref("RankedKeywordSuggestionsResponse"),
            undefined,
            [
              { in: "query", name: "estimate_only", schema: { type: "boolean", default: false } },
              { in: "query", name: "require_payment", schema: { type: "boolean", default: false } },
              {
                in: "query",
                name: "payment_option_id",
                schema: { type: "string", minLength: 1, maxLength: 120 },
              },
              {
                in: "query",
                name: "payment_quote_token",
                schema: { type: "string", minLength: 1, maxLength: 12000 },
              },
              {
                in: "query",
                name: "connection_id",
                schema: {
                  minLength: 1,
                  maxLength: 120,
                  pattern: "^conn_[a-z][a-z0-9]{23}$",
                  type: "string",
                },
              },
              {
                in: "query",
                name: "offset",
                schema: {
                  default: 0,
                  maximum: 900,
                  minimum: 0,
                  multipleOf: 100,
                  type: "integer",
                },
              },
              {
                in: "query",
                name: "limit",
                schema: { default: 100, maximum: 100, minimum: 1, type: "integer" },
              },
              {
                in: "query",
                name: "fresh",
                schema: { default: false, type: "boolean" },
              },
              {
                description:
                  "Best-effort pre-estimate provider cost gate, in cents. 0 = cached result only; a cache miss returns cost_limit_exceeded with estimated_cost_cents before paid work.",
                in: "query",
                name: "max_cost_cents",
                schema: { minimum: 0, type: "integer", ...usdCents },
              },
            ],
          ),
        ),
      ),
    },
  };
}
