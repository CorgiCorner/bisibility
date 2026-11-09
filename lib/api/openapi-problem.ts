import { openEnum, sdkName, taggedUnion } from "./openapi-sdk-schema";
// Every API error goes through errorResponse (lib/api/responses.ts), which sends RFC 9457
// problem documents. The spec must declare that media type, not application/json.
export const PROBLEM_CONTENT_TYPE = "application/problem+json";

const problemSchemaRef = { $ref: "#/components/schemas/Problem" };

export function problemContent(schema: object = problemSchemaRef) {
  return { [PROBLEM_CONTENT_TYPE]: { schema } };
}

export function problemResponse(description: string, schema?: object) {
  return { content: problemContent(schema), description };
}

export const problemResponses = {
  "400": problemResponse("Bad request"),
  "401": problemResponse("Unauthorized"),
  "403": problemResponse("Forbidden; capacity denials use plan_limit_reached", {
    anyOf: [
      { $ref: "#/components/schemas/CapacityLimitProblem" },
      { $ref: "#/components/schemas/Problem" },
    ],
    ...sdkName("ForbiddenProblem"),
    ...taggedUnion("type", ["capacityLimit", "problem"]),
  }),
  "404": problemResponse("Not found"),
  "429": {
    ...problemResponse(
      "Rate limited or weekly_request_cap_reached. Weekly capacity resets at details.resetsAt.",
    ),
    headers: {
      "Retry-After": {
        description: "Seconds until retry is allowed.",
        schema: { type: "integer", minimum: 1 },
      },
    },
  },
};

export const problemSchema = {
  properties: {
    code: { type: "string" },
    detail: { type: "string" },
    details: { additionalProperties: true, type: "object" },
    docs_url: { type: "string" },
    errors: {},
    instance: { type: "string" },
    status: { type: "integer" },
    subscriptionRequired: { type: "boolean" },
    title: { type: "string" },
    type: { type: "string" },
  },
  required: ["type", "title", "status", "detail", "instance", "docs_url"],
  type: "object",
};

export const subscriptionRequiredProblemSchema = {
  ...problemSchema,
  properties: {
    ...problemSchema.properties,
    code: { const: "subscription_required", type: "string" },
    status: { const: 403, type: "integer" },
    subscriptionRequired: { const: true, type: "boolean" },
    type: { const: "https://bisibility.com/problems/subscription-required", type: "string" },
  },
  required: [...problemSchema.required, "code", "subscriptionRequired"],
};

export const capacityLimitDetailsSchema = {
  type: "object",
  properties: {
    code: { const: "plan_limit_reached", type: "string" },
    dimension: { type: "string" },
    limit: { type: "number" },
    used: { type: "number" },
    requested: { type: "number" },
    scope: { type: "string", enum: ["account", "project"], ...openEnum("CapacityScope") },
    resetsAt: { type: "string" },
    suggestedPlan: { type: "string" },
    upgradeUrl: { type: "string" },
  },
  required: ["code", "dimension", "limit", "used", "requested", "scope"],
};
export const capacityLimitProblemSchema = {
  ...problemSchema,
  properties: {
    ...problemSchema.properties,
    code: { const: "plan_limit_reached", type: "string" },
    status: { const: 403, type: "integer" },
    type: { const: "https://bisibility.com/problems/plan_limit_reached", type: "string" },
    details: { $ref: "#/components/schemas/CapacityLimitDetails" },
  },
  required: [...problemSchema.required, "code", "details"],
};
