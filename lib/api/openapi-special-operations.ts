import { problemResponse } from "./openapi-problem";
import { sdkName, usdCents } from "./openapi-sdk-schema";

const json = (schema: object) => ({ "application/json": { schema } });
const response = (schema: object, description: string) => ({ content: json(schema), description });

import { withCreditsExhausted } from "./openapi-operations";

export function runRankCheckOperation(input: {
  problemResponses: object;
  rankCheckRef: object;
  rankCheckRunRef: object;
  security: object[];
}) {
  return withCreditsExhausted({
    operationId: "runRankCheck",
    parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
    requestBody: {
      content: json({
        ...sdkName("RunRankCheckRequest"),
        properties: {
          provider_id: { minLength: 1, maxLength: 80, type: "string" },
          max_cost_cents: {
            ...usdCents,
            description:
              "Best-effort pre-estimate provider cost gate, in cents. The launch is refused with cost_limit_exceeded when its preflight estimate exceeds it.",
            minimum: 1,
            type: "integer",
          },
        },
        type: "object",
      }),
      required: false,
    },
    responses: {
      "201": response(input.rankCheckRef, "Rank check completed when inline execution is enabled"),
      "202": response(input.rankCheckRunRef, "Rank check queued"),
      ...input.problemResponses,
      "422": problemResponse("The launch estimate exceeds max_cost_cents"),
    },
    security: input.security,
    summary: "Queue one rank check",
  });
}

export function createSignalOperation(input: { problemResponses: object; security: object[] }) {
  return {
    operationId: "createSignal",
    requestBody: {
      content: json({ $ref: "#/components/schemas/SignalCreate" }),
      required: true,
    },
    responses: {
      "201": response({ $ref: "#/components/schemas/Signal" }, "Signal ingested"),
      "423": problemResponse("Project read-only"),
      ...input.problemResponses,
    },
    security: input.security,
    summary: "Ingest a project signal",
  };
}
