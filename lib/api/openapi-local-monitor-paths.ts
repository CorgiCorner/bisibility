import { localMonitorResultSchemas } from "./openapi-local-monitor-results";
import { problemResponse } from "./openapi-problem";
import { publicIdSchema } from "./openapi-public-id";

type Bearer = (
  summary: string,
  operationId: string,
  schema: object,
  request?: object,
  parameters?: object[],
) => { responses: Record<string, object> };
const parameter = (name: string, schema: object) => ({ in: "query", name, schema });
const instant = {
  type: "string",
  format: "date-time",
  pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$",
  minLength: 24,
  maxLength: 24,
};
const asOf = parameter("as_of", {
  ...instant,
  type: "string",
  format: "date-time",
  description: "Canonical UTC timestamp including milliseconds; fixed across continuation pages.",
});
const history = [
  asOf,
  ...["from", "to"].map((name) => parameter(name, instant)),
  parameter("cursor", { type: "string", minLength: 1, maxLength: 8000 }),
];
const path = (name: string, prefix: string) => ({
  in: "path",
  name,
  required: true,
  schema: publicIdSchema(prefix),
});
const projectParameter = path("project_id", "prj");
const runParameters = [projectParameter, path("monitor_id", "lmn"), path("run_id", "lmr")];
const pointParameters = [...runParameters, path("target_id", "lmt")];

export function localMonitorResultPaths(baseBearer: Bearer) {
  const bearer: Bearer = (...args) => {
    const operation = baseBearer(...args);
    const problem = problemResponse;
    return {
      ...operation,
      responses: {
        ...operation.responses,
        "409": problem(
          "The retained source or captured freshness policy changed; restart selection.",
        ),
        "413": problem("The retained selection exceeds bounded read capacity."),
      },
    };
  };
  const runs = "/projects/{project_id}/local-monitors/{monitor_id}/runs";
  const run = `${runs}/{run_id}`,
    point = `${run}/points/{target_id}`;
  const exported = bearer(
    "Export retained Local run points as JSON or CSV",
    "exportLocalMonitorRun",
    localMonitorResultSchemas.LocalMonitorPointReport,
    undefined,
    [
      ...runParameters,
      asOf,
      parameter("version", { type: "string", enum: ["1"], default: "1" }),
      parameter("format", { type: "string", enum: ["json", "csv"], default: "json" }),
    ],
  );
  return {
    [runs]: {
      get: bearer(
        "Read immutable Local monitor run history",
        "listLocalMonitorRuns",
        localMonitorResultSchemas.LocalMonitorRunHistory,
        undefined,
        [projectParameter, path("monitor_id", "lmn"), ...history],
      ),
    },
    [`${run}/results`]: {
      get: bearer(
        "Read retained Local run points and grid quality",
        "getLocalMonitorRunResults",
        localMonitorResultSchemas.LocalMonitorRunResult,
        undefined,
        [...runParameters, asOf],
      ),
    },
    [`${point}/listings`]: {
      get: bearer(
        "Read retained normalized Local point listings",
        "listLocalMonitorPointListings",
        localMonitorResultSchemas.LocalMonitorPointListings,
        undefined,
        [...pointParameters, asOf],
      ),
    },
    [`${point}/history`]: {
      get: bearer(
        "Read exact captured Local point history",
        "listLocalMonitorPointHistory",
        localMonitorResultSchemas.LocalMonitorPointHistory,
        undefined,
        [...pointParameters, ...history],
      ),
    },
    [`${run}/export`]: {
      get: {
        ...exported,
        responses: {
          ...exported.responses,
          "200": {
            description:
              "Retained sampled-point report; provider and financial unknowns remain explicit",
            content: {
              "application/json": { schema: localMonitorResultSchemas.LocalMonitorPointReport },
              "text/csv": { schema: { type: "string" } },
            },
          },
        },
      },
    },
  };
}
