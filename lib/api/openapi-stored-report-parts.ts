import { openEnum, sdkName, usdCents } from "./openapi-sdk-schema";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

export const dateSchema = { format: "date-time", type: "string" };
const nullableDate = { format: "date-time", type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };

export const freshnessDesc =
  "fresh_until is authoritative: a report is fresh while now is before fresh_until, and the window is 30 days counted from the earliest successful source fetch, which can be earlier than saved_at.";
export const freshUntilSchema = { ...dateSchema, description: freshnessDesc };
export const freshnessSchema = {
  ...openEnum("StoredReportFreshness"),
  description: freshnessDesc,
  enum: ["fresh", "stale"],
  type: "string",
};

const dataStateDesc =
  "the stored report outcome, the same value GET /projects/{project_id}/domain-overview returns as state";

const domainOverviewStateDesc = `${freshnessDesc} This is report freshness, not the data outcome; data_state carries the no_data/ok/partial value that GET /projects/{project_id}/domain-overview returns as state.`;

export const storageFields = {
  ...sdkName("StoredReportStorage"),
  properties: {
    fresh_until: freshUntilSchema,
    saved_at: dateSchema,
    stale: { type: "boolean" },
    state: freshnessSchema,
  },
  required: ["saved_at", "fresh_until", "stale", "state"],
  type: "object",
};

const monthlyTrend = {
  items: {
    properties: {
      month: { maximum: 12, minimum: 1, type: "integer" },
      search_volume: nullableNumber,
      year: { type: "integer" },
    },
    ...sdkName("StoredReportMonthlySearchVolume"),
    required: ["year", "month", "search_volume"],
    type: "object",
  },
  maxItems: 12,
  type: "array",
};

const researchRowMetrics = {
  competition: { maximum: 1, minimum: 0, type: ["number", "null"] },
  cpc_cents: { minimum: 0, type: ["integer", "null"], ...usdCents },
  difficulty: { maximum: 100, minimum: 0, type: ["number", "null"] },
  intent: {
    enum: ["informational", "commercial", "transactional", "navigational", "unknown", null],
    type: ["string", "null"],
    ...openEnum("StoredReportKeywordIntent"),
  },
  monthly_trend: monthlyTrend,
  search_volume: { minimum: 0, type: ["number", "null"] },
};

const sourceReasons = [
  "budget_exhausted",
  "cost_limit",
  "in_progress",
  "needs_reauth",
  "no_source",
  "previous_source_failed",
  "provider_error",
  "rate_limited",
  "result_limit",
  "unsupported_location",
];

const researchSourceDiagnostic = {
  ...sdkName("StoredReportSourceDiagnostic"),
  properties: {
    cached: { type: "boolean" },
    cost_cents: { minimum: 0, type: "number", ...usdCents },
    reason: { enum: sourceReasons, type: "string", ...openEnum("StoredReportSourceReason") },
    returned: { minimum: 0, type: "integer" },
    source: {
      enum: ["related", "suggestion", "idea"],
      type: "string",
      ...openEnum("StoredReportKeywordSource"),
    },
    status: {
      enum: ["ok", "failed", "skipped"],
      type: "string",
      ...openEnum("StoredReportSourceStatus"),
    },
  },
  required: ["cached", "cost_cents", "returned", "source", "status"],
  type: "object",
};

export const domainOverviewReportProperties = {
  cached: { type: "boolean" },
  cost_cents: { minimum: 0, type: "number", ...usdCents },
  country_code: { type: ["string", "null"] },
  data_state: {
    description: dataStateDesc,
    enum: ["no_data", "ok", "partial"],
    type: "string",
    ...openEnum("StoredReportDataState"),
  },
  fetched_at: dateSchema,
  fresh_until: freshUntilSchema,
  history: {
    anyOf: [{ items: ref("DomainOverviewHistoricalRow"), type: "array" }, { type: "null" }],
  },
  keywords: { anyOf: [ref("DomainOverviewKeywordsData"), { type: "null" }] },
  language_code: { type: "string" },
  location_code: { type: "integer" },
  overview: { anyOf: [ref("DomainOverviewMetrics"), { type: "null" }] },
  pages: { anyOf: [ref("DomainOverviewPagesData"), { type: "null" }] },
  partial: { type: "boolean" },
  previous_fetched_at: nullableDate,
  previous_overview: { anyOf: [ref("DomainOverviewMetrics"), { type: "null" }] },
  previous_source_snapshot_at: nullableDate,
  provider: { type: "string" },
  saved_at: dateSchema,
  scope: { enum: ["root", "subdomain"], type: "string", ...openEnum("StoredReportDomainScope") },
  source_snapshot_at: nullableDate,
  stale: { type: "boolean" },
  state: {
    description: domainOverviewStateDesc,
    enum: ["fresh", "stale"],
    type: "string",
    ...openEnum("StoredReportFreshness"),
  },
  target: { type: "string" },
};

export const keywordResearchReportProperties = {
  cached: { type: "boolean" },
  cost_cents: { minimum: 0, type: "number", ...usdCents },
  country_code: { type: "string" },
  fetched_at: dateSchema,
  fresh_until: freshUntilSchema,
  include_clickstream: { type: "boolean" },
  language_code: { type: "string" },
  mode: { type: "string" },
  partial: { type: "boolean" },
  provider: { type: "string" },
  request_key: { type: "string" },
  result_limit: { minimum: 1, type: "integer" },
  rows: {
    items: {
      ...sdkName("StoredReportKeywordRow"),
      properties: {
        already_saved: { type: "boolean" },
        already_tracked: { type: "boolean" },
        keyword: { type: "string" },
        source: {
          enum: ["related", "suggestion", "idea"],
          type: "string",
          ...openEnum("StoredReportKeywordSource"),
        },
        ...researchRowMetrics,
      },
      required: [
        "keyword",
        "source",
        "already_saved",
        "already_tracked",
        ...Object.keys(researchRowMetrics),
      ],
      type: "object",
    },
    type: "array",
  },
  saved_at: dateSchema,
  seed: { type: "string" },
  sources: { items: researchSourceDiagnostic, type: "array" },
  stale: { type: "boolean" },
  state: freshnessSchema,
};
