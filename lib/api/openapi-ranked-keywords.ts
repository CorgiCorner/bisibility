import type { schemas } from "./openapi-components";

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
      "422": {
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/Problem" } },
        },
        description: "Unprocessable request",
      },
    },
  };
}

export function rankedKeywordSuggestionPaths(input: {
  bearer: Bearer;
  ref: (name: keyof typeof schemas) => object;
}) {
  return {
    "/projects/{project_id}/ranked-keyword-suggestions": {
      get: withUnprocessable(
        input.bearer(
          "List ranked keyword suggestions",
          "listRankedKeywordSuggestions",
          input.ref("RankedKeywordSuggestionsResponse"),
          undefined,
          [
            {
              in: "query",
              name: "connection_id",
              schema: { pattern: "^conn_[a-z][a-z0-9]{23}$", type: "string" },
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
          ],
        ),
      ),
    },
  };
}
