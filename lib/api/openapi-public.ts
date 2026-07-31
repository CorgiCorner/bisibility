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
const string = { type: "string" };
const unknownAware = (values: string[]) => ({ enum: [...values, "unknown"], type: "string" });
const probeStatus = { enum: ["degraded", "ok"], type: "string" };
const appIdentityProperties = {
  app: { enum: ["ok"], type: "string" },
  appRelease: string,
  appRevision: string,
};
const checkedAt = { format: "date-time", type: "string" };
const livenessResponse = {
  properties: {
    checked_at: checkedAt,
    services: {
      properties: appIdentityProperties,
      required: Object.keys(appIdentityProperties),
      type: "object",
    },
    status: { enum: ["ok"], type: "string" },
  },
  required: ["checked_at", "services", "status"],
  type: "object",
};
const readinessServiceProperties = {
  ...appIdentityProperties,
  database: { enum: ["degraded", "ok"], type: "string" },
  migrations: unknownAware(["incomplete", "ready"]),
};
const readinessResponse = {
  properties: {
    checked_at: checkedAt,
    services: {
      properties: readinessServiceProperties,
      required: Object.keys(readinessServiceProperties),
      type: "object",
    },
    status: probeStatus,
  },
  required: ["checked_at", "services", "status"],
  type: "object",
};
const healthServiceProperties = {
  ...readinessServiceProperties,
  appEnvironment: string,
  appRankCheckSchedulerMode: unknownAware(["cutover", "dispatcher", "legacy"]),
  lastHeartbeatAt: { format: "date-time", type: ["string", "null"] },
  temporal: unknownAware(["degraded", "down", "ok"]),
  worker: unknownAware(["degraded", "down", "ok"]),
  workerEnvironment: string,
  workerHeartbeatState: unknownAware(["absent", "fresh", "future", "invalid", "stale"]),
  workerRankCheckSchedulerMode: unknownAware(["cutover", "dispatcher", "legacy"]),
  workerRelease: string,
  workerRevision: string,
  workerSchema: unknownAware(["drift", "ok"]),
};
const healthResponse = {
  properties: {
    checked_at: checkedAt,
    liveness: { enum: ["ok"], type: "string" },
    providers: { additionalProperties: { items: string, type: "array" }, type: "object" },
    rate_limits: { additionalProperties: obj, type: "object" },
    readiness: probeStatus,
    serp: obj,
    services: {
      properties: healthServiceProperties,
      required: Object.keys(healthServiceProperties),
      type: "object",
    },
    status: probeStatus,
  },
  required: [
    "checked_at",
    "liveness",
    "providers",
    "rate_limits",
    "readiness",
    "serp",
    "services",
    "status",
  ],
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
      operationId: "getHealth",
      responses: {
        "200": response(healthResponse, "Composite health report is healthy"),
        "503": response(healthResponse, "Composite health report is degraded"),
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
        "200": response(readinessResponse, "Web process is ready to serve traffic"),
        "503": response(readinessResponse, "Web process is not ready to serve traffic"),
      },
    },
  },
};
