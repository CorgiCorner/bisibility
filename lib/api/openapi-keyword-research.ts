import type { schemas } from "./openapi-components";
import { withRequiredBody } from "./openapi-operations";

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
        description: "Unsupported provider location or provider reauthorization required",
      },
    },
  };
}

export function keywordResearchPaths(input: {
  bearer: Bearer;
  ref: (name: keyof typeof schemas) => object;
}) {
  return {
    "/projects/{project_id}/keyword-metrics": {
      post: withUnprocessable(
        withRequiredBody(
          input.bearer(
            "Get or estimate metrics for up to 700 keywords. Requires write scope.",
            "getKeywordMetrics",
            input.ref("KeywordMetricsResponse"),
            input.ref("KeywordMetricsRequest"),
          ),
        ),
      ),
    },
    "/projects/{project_id}/keyword-research": {
      get: withUnprocessable(
        input.bearer(
          "Research or estimate keywords from one seed. Requires write scope.",
          "researchKeywords",
          input.ref("KeywordResearchResponse"),
          undefined,
          [
            {
              in: "query",
              name: "seed",
              required: true,
              schema: { maxLength: 80, minLength: 1, type: "string" },
            },
            {
              in: "query",
              name: "mode",
              schema: {
                default: "auto",
                enum: ["auto", "related", "suggestions", "ideas"],
                type: "string",
              },
            },
            {
              in: "query",
              name: "result_limit",
              schema: { default: 100, enum: [100, 300, 500], type: "integer" },
            },
            {
              in: "query",
              name: "connection_id",
              schema: { pattern: "^conn_[a-z][a-z0-9]{23}$", type: "string" },
            },
            {
              description: "Use clickstream-refined volume metrics. Provider cost is doubled.",
              in: "query",
              name: "include_clickstream",
              schema: { default: false, type: "boolean" },
            },
            { in: "query", name: "fresh", schema: { default: false, type: "boolean" } },
            {
              description: "Return a free cache-aware provider cost estimate without a lookup.",
              in: "query",
              name: "estimate_only",
              schema: { default: false, type: "boolean" },
            },
            {
              description: "Best-effort maximum provider cost for this request, in cents.",
              in: "query",
              name: "max_cost_cents",
              schema: { minimum: 1, type: "integer" },
            },
          ],
        ),
      ),
    },
  };
}
