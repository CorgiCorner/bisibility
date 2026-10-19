import { apiFeatures, getApiVersionCapabilities } from "./api-versions";
import { costEstimateParameters } from "./openapi-parameters";
import { problemResponse } from "./openapi-problem";
import { openEnum, sdkName } from "./openapi-sdk-schema";

const json = (schema: object) => ({ "application/json": { schema } });
const response = (schema: object, description = "JSON response") => ({
  content: json(schema),
  description,
});
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const envelope = (schema: object, name: string) => ({
  properties: { data: schema },
  required: ["data"],
  type: "object",
  ...sdkName(name),
});
const probeStatus = { enum: ["degraded", "ok"], type: "string", ...openEnum("HealthState") };
const rankCheckSchedulerMode = {
  enum: ["cutover", "dispatcher", "invalid", "legacy"],
  type: "string",
  ...openEnum("RankCheckSchedulerMode"),
};
const schedulerDriver = {
  enum: ["invalid", "legacy-auto", "none", "temporal"],
  type: "string",
  ...openEnum("SchedulerDriver"),
};
const livenessResponse = {
  properties: { status: { enum: ["ok"], type: "string" } },
  required: ["status"],
  type: "object",
};
export const publicSchemas = {
  HealthStatus: {
    properties: { status: probeStatus },
    required: ["status"],
    type: "object",
  },
};
const statusResponse = ref("HealthStatus");
const apiVersions = getApiVersionCapabilities().apiVersions;
const capabilitiesResponse = {
  properties: {
    apiVersions: {
      items: { enum: apiVersions, type: "string", ...openEnum("ApiVersion") },
      minItems: 1,
      type: "array",
    },
    authentication: {
      properties: {
        scheme: { const: "bearer", type: "string" },
        scope: { type: "string" },
      },
      required: ["scheme", "scope"],
      type: "object",
      ...sdkName("CapabilitiesAuthentication"),
    },
    data: { items: ref("Capability"), type: "array" },
    description: { type: "string" },
    features: {
      description: "Supported request protocols, independent of the caller's permissions.",
      properties: {
        reviewed_project_defaults: { const: apiFeatures.reviewed_project_defaults, type: "string" },
      },
      required: ["reviewed_project_defaults"],
      type: "object",
      ...sdkName("CapabilitiesFeatures"),
    },
    rank_check_scheduler_mode: rankCheckSchedulerMode,
    scheduler_driver: schedulerDriver,
  },
  required: [
    "apiVersions",
    "authentication",
    "data",
    "description",
    "features",
    "rank_check_scheduler_mode",
    "scheduler_driver",
  ],
  type: "object",
  ...sdkName("Capabilities"),
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
        "200": response(envelope(ref("CostEstimate"), "CostEstimateResponse")),
        "400": problemResponse("Bad request"),
        "404": problemResponse("Not found"),
        "429": problemResponse("Rate limited"),
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
    get: { operationId: "getOpenApi", responses: { "200": response(ref("OpenApiDocument")) } },
  },
  "/provider-rates": {
    get: {
      operationId: "getProviderRates",
      responses: {
        "200": response(
          envelope({ items: ref("ProviderRateCard"), type: "array" }, "ProviderRateCardList"),
        ),
        "429": problemResponse("Rate limited"),
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
