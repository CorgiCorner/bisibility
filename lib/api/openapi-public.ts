import { getApiVersionCapabilities } from "./api-versions";
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
const probeStatus = { enum: ["degraded", "ok"], type: "string" };
const livenessResponse = {
  properties: { status: { enum: ["ok"], type: "string" } },
  required: ["status"],
  type: "object",
};
const statusResponse = {
  properties: { status: probeStatus },
  required: ["status"],
  type: "object",
};
const apiVersions = getApiVersionCapabilities().apiVersions;
const capabilitiesResponse = {
  properties: {
    apiVersions: {
      items: { enum: apiVersions, type: "string" },
      minItems: 1,
      type: "array",
    },
    data: { items: obj, type: "array" },
  },
  required: ["apiVersions", "data"],
  type: "object",
};

export const publicPaths = {
  "/capabilities": {
    get: {
      operationId: "getCapabilities",
      responses: { "200": response(capabilitiesResponse) },
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
    get: {
      description:
        "Anonymous responses expose only status. Valid API credentials or INTERNAL_PROBE_TOKEN receive additional operator diagnostics outside the public SDK schema.",
      operationId: "getHealth",
      responses: {
        "200": response(statusResponse, "Composite health report is healthy"),
        "503": response(statusResponse, "Composite health report is degraded"),
      },
    },
  },
  "/liveness": {
    get: {
      operationId: "getLiveness",
      responses: { "200": response(livenessResponse, "Web process is alive") },
    },
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
  "/readiness": {
    get: {
      operationId: "getReadiness",
      responses: {
        "200": response(statusResponse, "Web process is ready to serve traffic"),
        "503": response(statusResponse, "Web process is not ready to serve traffic"),
      },
    },
  },
};
