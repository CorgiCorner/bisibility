import { openEnum, sdkName } from "./openapi-sdk-schema";

export const analyticsSchemas = {
  SearchPerformanceQueryStat: {
    properties: {
      clicks: { minimum: 0, type: "integer" },
      ctr: { minimum: 0, type: "number" },
      impressions: { minimum: 0, type: "integer" },
      country: {
        description:
          "Lowercase ISO 3166-1 alpha-3 code. Present only when country was requested as a dimension.",
        type: "string",
      },
      device: {
        description: "Lowercase device. Present only when device was requested as a dimension.",
        type: "string",
      },
      page: { type: ["string", "null"] },
      position: { minimum: 0, type: "number" },
      query: { type: "string" },
    },
    required: ["query", "clicks", "impressions", "ctr", "position"],
    type: "object",
  },
  SearchPerformanceQueryStatsResponse: {
    description:
      "Rows aggregate every country and device only when no country or device filter or dimension is requested. A query filter is an exact match unless query_match=contains.",
    properties: {
      connection: { $ref: "#/components/schemas/AnalyticsConnection" },
      result: {
        ...sdkName("SearchPerformanceQueryResult"),
        properties: {
          row_cap: {
            description: "Maximum number of rows this request can return.",
            type: "integer",
          },
          rows_returned: {
            description: "Rows carried in this response after all filters.",
            type: "integer",
          },
          sort: {
            description: "Rows are ordered by clicks, highest first.",
            enum: ["clicks_desc"],
            ...openEnum("SearchPerformanceSort"),
            type: "string",
          },
          next_offset: {
            description:
              "offset plus limit when truncated is true, otherwise null. clicks_min, impressions_min and position_max are applied after the source cap, so a null value does not prove that no further matching rows exist when those filters are set.",
            type: ["integer", "null"],
          },
          truncated: {
            description:
              "True exactly when this response carries row_cap rows; more matching rows may exist. clicks_min, impressions_min and position_max are applied after the source cap, so when they are set a false value does not prove that no further matching rows exist.",
            type: "boolean",
          },
        },
        required: ["row_cap", "rows_returned", "truncated", "sort", "next_offset"],
        type: "object",
      },
      rows: {
        items: { $ref: "#/components/schemas/SearchPerformanceQueryStat" },
        type: "array",
      },
      scope: {
        ...sdkName("SearchPerformanceQueryScope"),
        properties: {
          country: {
            description:
              "Country filter applied to the rows, as a lowercase ISO 3166-1 alpha-3 code, or null when no country filter was requested. Rows aggregate every country and device only when no country or device filter or dimension is requested.",
            type: ["string", "null"],
          },
          device: {
            description:
              "Device filter applied to the rows (desktop, mobile, or tablet), or null when no device filter was requested. Rows aggregate every country and device only when no country or device filter or dimension is requested.",
            type: ["string", "null"],
          },
          dimensions: {
            description:
              "Dimensions the source grouped rows by, ordered query, page, country, device. Defaults to query, plus page when page_path is set.",
            items: {
              enum: ["query", "page", "country", "device"],
              type: "string",
              ...openEnum("SearchPerformanceDimension"),
            },
            type: "array",
          },
          end_date: { format: "date", type: "string" },
          offset: {
            description: "Number of source rows skipped before this page.",
            minimum: 0,
            type: "integer",
          },
          page_path: {
            description: "Page path filter applied, or null when none was requested.",
            type: ["string", "null"],
          },
          query_match: {
            description:
              "Match semantics applied to the query filter: exact match unless query_match=contains.",
            enum: ["equals", "contains"],
            ...openEnum("SearchPerformanceQueryMatch"),
            type: "string",
          },
          start_date: { format: "date", type: "string" },
        },
        required: [
          "start_date",
          "end_date",
          "dimensions",
          "query_match",
          "page_path",
          "country",
          "device",
          "offset",
        ],
        type: "object",
      },
    },
    required: ["connection", "rows", "scope", "result"],
    type: "object",
  },
} as const;
