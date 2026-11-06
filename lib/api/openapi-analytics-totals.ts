import { closedEnum, openEnum } from "./openapi-sdk-schema";

const date = { type: "string", format: "date" };
const nullableDate = { type: ["string", "null"], format: "date" };
export const performanceTotalsParameters = [
  ...["start_date", "end_date"].map((name) => ({
    in: "query",
    name,
    required: true,
    schema: { type: "string", pattern: "^[1-9]\\d{3}-\\d{2}-\\d{2}$" },
    description: "Inclusive Pacific calendar date. A window contains at most 366 days.",
  })),
  {
    in: "query",
    name: "compare_previous",
    schema: {
      type: "string",
      enum: ["true", "false"],
      default: "false",
      ...closedEnum("SearchPerformanceComparePrevious"),
    },
    description: "Include the immediately preceding, equal-length inclusive period.",
  },
];

export const performanceTotalsSchemas = {
  SearchPerformanceFreshness: {
    type: "object",
    required: ["data_state", "fetched_at", "finalized_through", "first_incomplete_date"],
    properties: {
      data_state: {
        type: "string",
        enum: ["all", "final"],
        ...openEnum("SearchPerformanceDataState"),
        description:
          "final means finalized import coverage or provider metadata proves the whole period finalized. all includes potentially provisional data.",
      },
      fetched_at: {
        type: "string",
        format: "date-time",
        description:
          "Live response time or conservative oldest persistence time of the covering aggregate requests.",
      },
      finalized_through: {
        ...nullableDate,
        description: "Last date proven finalized within this period, or null when unknown.",
      },
      first_incomplete_date: {
        ...nullableDate,
        description:
          "Provider-reported first incomplete date in this period, or null when absent/outside it. Null alone does not prove finalization.",
      },
    },
  },
  SearchPerformancePeriod: {
    type: "object",
    required: [
      "start_date",
      "end_date",
      "data_start_date",
      "data_end_date",
      "clicks",
      "impressions",
      "ctr",
      "position",
      "freshness",
    ],
    properties: {
      start_date: date,
      end_date: date,
      data_start_date: {
        ...nullableDate,
        description:
          "First returned aggregate day with impressions, or null when no data was returned.",
      },
      data_end_date: {
        ...nullableDate,
        description:
          "Last returned aggregate day with impressions, or null when no data was returned.",
      },
      clicks: { type: "integer", minimum: 0 },
      impressions: { type: "integer", minimum: 0 },
      ctr: {
        type: "number",
        minimum: 0,
        description: "Total clicks divided by total impressions; zero for no impressions.",
      },
      position: {
        type: "number",
        minimum: 0,
        description: "Impression-weighted average position; zero for no impressions.",
      },
      freshness: { $ref: "#/components/schemas/SearchPerformanceFreshness" },
    },
  },
  SearchPerformanceTotalsResponse: {
    type: "object",
    description:
      "Web search totals across all queries, pages, countries and devices. Stored aggregate rows require complete successful finalized request provenance. Otherwise one live date-only series (at most 732 days, row limit 1000) supplies both periods, including provisional days. No imports are started and requested dates are never shifted. Empty covered periods return zero metrics with null data dates.",
    required: ["property", "search_type", "source", "current", "previous"],
    properties: {
      property: { type: "string" },
      search_type: { type: "string", enum: ["web"], ...openEnum("SearchPerformanceSearchType") },
      source: {
        type: "string",
        enum: ["stored", "live"],
        ...openEnum("SearchPerformanceTotalsSource"),
      },
      current: { $ref: "#/components/schemas/SearchPerformancePeriod" },
      previous: {
        anyOf: [{ $ref: "#/components/schemas/SearchPerformancePeriod" }, { type: "null" }],
        description: "Previous equal-length period when compare_previous=true; otherwise null.",
      },
    },
  },
};
