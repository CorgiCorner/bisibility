import type { schemas } from "./openapi-components";

type Bearer = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
  parameters?: object[],
) => object;

const dateParameters = [
  {
    in: "query",
    name: "start_date",
    required: true,
    schema: { format: "date", type: "string" },
  },
  {
    in: "query",
    name: "end_date",
    required: true,
    schema: { format: "date", type: "string" },
  },
];

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

export function analyticsPaths(input: {
  bearer: Bearer;
  ref: (name: keyof typeof schemas) => object;
}) {
  return {
    "/projects/{project_id}/analytics/query-stats": {
      get: withUnprocessable(
        input.bearer(
          "List live search-performance query statistics",
          "listSearchPerformanceQueryStats",
          input.ref("SearchPerformanceQueryStatsResponse"),
          undefined,
          [
            ...dateParameters,
            {
              in: "query",
              name: "connection_id",
              schema: { pattern: "^conn_[a-z][a-z0-9]{23}$", type: "string" },
            },
            { in: "query", name: "query", schema: { maxLength: 1000, type: "string" } },
            {
              in: "query",
              name: "limit",
              schema: { default: 100, maximum: 1000, minimum: 1, type: "integer" },
            },
          ],
        ),
      ),
    },
    "/projects/{project_id}/analytics/sync": {
      post: input.bearer(
        "Synchronize project analytics traffic now",
        "syncProjectTraffic",
        input.ref("TrafficSyncSummary"),
      ),
    },
    "/projects/{project_id}/analytics/traffic-snapshots": {
      get: input.bearer(
        "List stored page traffic snapshots",
        "listTrafficSnapshots",
        input.ref("PageTrafficSnapshotsResponse"),
        undefined,
        [
          ...dateParameters,
          {
            explode: true,
            in: "query",
            name: "path",
            schema: { items: { type: "string" }, maxItems: 50, type: "array" },
            style: "form",
          },
          {
            in: "query",
            name: "limit",
            schema: { default: 50, maximum: 200, minimum: 1, type: "integer" },
          },
          {
            in: "query",
            name: "offset",
            schema: { default: 0, minimum: 0, type: "integer" },
          },
        ],
      ),
    },
  };
}
