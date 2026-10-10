import { backlinksSummary } from "./openapi-backlinks-parts";

export const backlinksFailedSummaryProblem = {
  allOf: [
    { $ref: "#/components/schemas/Problem" },
    {
      properties: {
        details: {
          additionalProperties: false,
          description:
            "Failed current request evidence. Total cost is unknown; the completed summary is not a reusable snapshot.",
          properties: {
            cost_cents: { type: "null" },
            known_summary_cost_cents: { minimum: 0, type: "number" },
            history_failure: {
              additionalProperties: false,
              properties: {
                code: {
                  enum: ["provider_usage_unconfirmed", "provider_transient", "unexpected_error"],
                  type: "string",
                },
                phase: {
                  enum: [
                    "admission",
                    "request",
                    "response_body",
                    "measurement",
                    "settlement",
                    "unknown",
                    null,
                  ],
                  type: ["string", "null"],
                },
              },
              required: ["code", "phase"],
              type: "object",
            },
            history_status: { const: "failed", type: "string" },
            include_subdomains: { type: "boolean" },
            ok: { const: false, type: "boolean" },
            provider: { type: "string" },
            reason: { const: "history_failed", type: "string" },
            rows_status: { const: "not_requested", type: "string" },
            status: { const: "failed", type: "string" },
            summary: { ...backlinksSummary, additionalProperties: false },
            target: { type: "string" },
            target_scope: { enum: ["site", "page"], type: "string" },
          },
          required: [
            "cost_cents",
            "known_summary_cost_cents",
            "history_failure",
            "history_status",
            "include_subdomains",
            "ok",
            "provider",
            "reason",
            "rows_status",
            "status",
            "summary",
            "target",
            "target_scope",
          ],
          type: "object",
        },
      },
      required: ["details"],
      type: "object",
    },
  ],
} as const;

export function withBacklinksFailedSummaryProblem(operation: object) {
  const responses = (operation as { responses: Record<string, object> }).responses;
  return {
    ...operation,
    responses: {
      ...responses,
      "500": {
        content: {
          "application/problem+json": {
            schema: {
              anyOf: [
                { $ref: "#/components/schemas/Problem" },
                { $ref: "#/components/schemas/BacklinksFailedSummaryProblem" },
              ],
            },
          },
        },
        description:
          "Unexpected failure, optionally carrying completed summary evidence after history failed. No rows were requested and total cost remains unknown.",
      },
    },
  };
}
