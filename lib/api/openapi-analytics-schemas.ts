export const analyticsSchemas = {
  SearchPerformanceQueryStat: {
    properties: {
      clicks: { minimum: 0, type: "integer" },
      ctr: { minimum: 0, type: "number" },
      impressions: { minimum: 0, type: "integer" },
      page: { type: ["string", "null"] },
      position: { minimum: 0, type: "number" },
      query: { type: "string" },
    },
    required: ["query", "clicks", "impressions", "ctr", "position"],
    type: "object",
  },
  SearchPerformanceQueryStatsResponse: {
    description:
      "Rows are the provider's aggregate over all countries and devices for the range; filter by query is exact match unless query_match=contains.",
    properties: {
      connection: { $ref: "#/components/schemas/AnalyticsConnection" },
      result: {
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
            type: "string",
          },
          truncated: {
            description:
              "True exactly when this response carries row_cap rows; more matching rows may exist. clicks_min, impressions_min and position_max are applied after the source cap, so when they are set a false value does not prove that no further matching rows exist.",
            type: "boolean",
          },
        },
        required: ["row_cap", "rows_returned", "truncated", "sort"],
        type: "object",
      },
      rows: {
        items: { $ref: "#/components/schemas/SearchPerformanceQueryStat" },
        type: "array",
      },
      scope: {
        properties: {
          country: {
            description:
              "Always null. Rows are the provider's aggregate over all countries and devices for the range.",
            type: "null",
          },
          device: {
            description:
              "Always null. Rows are the provider's aggregate over all countries and devices for the range.",
            type: "null",
          },
          dimensions: {
            description:
              "Dimensions the source grouped rows by: query, or query and page when page_path is set.",
            items: { enum: ["query", "page"], type: "string" },
            type: "array",
          },
          end_date: { format: "date", type: "string" },
          page_path: {
            description: "Page path filter applied, or null when none was requested.",
            type: ["string", "null"],
          },
          query_match: {
            description:
              "Match semantics applied to the query filter: exact match unless query_match=contains.",
            enum: ["equals", "contains"],
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
        ],
        type: "object",
      },
    },
    required: ["connection", "rows", "scope", "result"],
    type: "object",
  },
} as const;
