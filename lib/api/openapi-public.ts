import { costEstimateParameters } from "./openapi-parameters";

const json = (schema: object) => ({ "application/json": { schema } });
const response = (schema: object, description = "JSON response") => ({
  content: json(schema),
  description,
});
const obj = { type: "object" };
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const envelope = (schema: object) => ({
  properties: { data: schema },
  required: ["data"],
  type: "object",
});
const list = (schema: object) => ({
  properties: {
    data: { items: schema, type: "array" },
    meta: {
      properties: { next_cursor: { type: ["string", "null"] } },
      required: ["next_cursor"],
      type: "object",
    },
  },
  required: ["data", "meta"],
  type: "object",
});

export const publicPaths = {
  "/capabilities": {
    get: {
      operationId: "getCapabilities",
      responses: { "200": response(list({})) },
    },
  },
  "/cost-estimate": {
    get: {
      operationId: "getCostEstimate",
      parameters: costEstimateParameters,
      responses: {
        "200": response(envelope(obj)),
        "400": response(ref("Problem"), "Bad request"),
        "404": response(ref("Problem"), "Not found"),
        "429": response(ref("Problem"), "Rate limited"),
      },
      summary: "Estimate monthly SERP provider cost",
    },
  },
  "/health": {
    get: { operationId: "getHealth", responses: { "200": response(obj) } },
  },
  "/llms.txt": {
    get: {
      operationId: "getLlmsTxt",
      responses: {
        "200": {
          content: { "text/plain": { schema: { type: "string" } } },
          description: "Agent-readable API capability summary",
        },
      },
    },
  },
  "/openapi.json": {
    get: { operationId: "getOpenApi", responses: { "200": response(obj) } },
  },
  "/provider-rates": {
    get: {
      operationId: "getProviderRates",
      responses: {
        "200": response(envelope({ items: obj, type: "array" })),
        "429": response(ref("Problem"), "Rate limited"),
      },
      summary: "List public SERP provider rate cards",
    },
  },
};
