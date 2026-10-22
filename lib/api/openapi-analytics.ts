import type { schemas } from "./openapi-components";
import { problemResponse } from "./openapi-problem";
import { closedEnum } from "./openapi-sdk-schema";

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
      "404": problemResponse("No eligible search-performance source is connected."),
      "422": problemResponse("Provider authorization must be renewed (re-auth needed)."),
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
            ...dateParameters.map((parameter) => ({
              ...parameter,
              schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            })),
            {
              in: "query",
              name: "connection_id",
              schema: {
                minLength: 1,
                maxLength: 120,
                pattern: "^conn_[a-z][a-z0-9]{23}$",
                type: "string",
              },
            },
            {
              in: "query",
              name: "query",
              schema: { minLength: 1, maxLength: 1000, type: "string" },
            },
            {
              in: "query",
              name: "limit",
              schema: { default: 100, maximum: 1000, minimum: 1, type: "integer" },
            },
            {
              description: "Inclusive lower bound on clicks.",
              in: "query",
              name: "clicks_min",
              schema: { minimum: 0, type: "integer" },
            },
            {
              description: "Inclusive lower bound on impressions.",
              in: "query",
              name: "impressions_min",
              schema: { minimum: 0, type: "integer" },
            },
            {
              description: "Inclusive upper bound on average position.",
              in: "query",
              name: "position_max",
              schema: { minimum: 0, type: "number" },
            },
            {
              description: "Page path filter; setting it also groups rows by page.",
              in: "query",
              name: "page_path",
              schema: { minLength: 1, maxLength: 2048, type: "string" },
            },
            {
              description:
                "contains keeps rows whose page URL contains the given path; prefix matches pages whose URL starts with the source property host followed by the path.",
              in: "query",
              name: "page_path_match",
              schema: {
                ...closedEnum("SearchPerformancePagePathMatchInput"),
                default: "contains",
                enum: ["contains", "prefix"],
                type: "string",
              },
            },
            {
              description: "Match semantics for the query filter; default equals is exact match.",
              in: "query",
              name: "query_match",
              schema: {
                ...closedEnum("SearchPerformanceQueryMatchInput"),
                default: "equals",
                enum: ["equals", "contains"],
                type: "string",
              },
            },
            {
              description:
                "ISO 3166-1 alpha-3 country code. Case-insensitive; applied as lowercase.",
              in: "query",
              name: "country",
              schema: { pattern: "^[a-zA-Z]{3}$", type: "string" },
            },
            {
              description: "Device filter. Omit to include every device.",
              in: "query",
              name: "device",
              schema: {
                ...closedEnum("SearchPerformanceDeviceInput"),
                enum: ["desktop", "mobile", "tablet"],
                type: "string",
              },
            },
            {
              description:
                "Comma-separated grouping dimensions: query, page, country, device. Must include query, for example query,device. Whitespace around values is trimmed and duplicates are ignored. Sent in the order query, page, country, device. page is included whenever page_path is set.",
              in: "query",
              name: "dimensions",
              schema: {
                pattern:
                  "^\\s*(query|page|country|device)\\s*(,\\s*(query|page|country|device)\\s*)*$",
                type: "string",
              },
            },
            {
              description: "Number of source rows to skip before this page.",
              in: "query",
              name: "offset",
              schema: { default: 0, minimum: 0, type: "integer" },
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
        undefined,
        [{ $ref: "#/components/parameters/IdempotencyKey" }],
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
