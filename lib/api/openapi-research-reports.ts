type Bearer = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
  parameters?: object[],
) => object;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const dateSchema = { format: "date-time", type: "string" };
const nullableDate = { format: "date-time", type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };

const freshnessDesc =
  "fresh_until is authoritative: a report is fresh while now is before fresh_until, and the window is 30 days counted from the earliest successful source fetch, which can be earlier than saved_at.";
const freshUntilSchema = { ...dateSchema, description: freshnessDesc };
const freshnessSchema = { description: freshnessDesc, enum: ["fresh", "stale"], type: "string" };

const dataStateDesc =
  "the stored report outcome, the same value GET /projects/{project_id}/domain-overview returns as state";

const domainOverviewStateDesc = `${freshnessDesc} This is report freshness, not the data outcome; data_state carries the no_data/ok/partial value that GET /projects/{project_id}/domain-overview returns as state.`;

const storageFields = {
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
    required: ["year", "month", "search_volume"],
    type: "object",
  },
  maxItems: 12,
  type: "array",
};

const researchRowMetrics = {
  competition: { maximum: 1, minimum: 0, type: ["number", "null"] },
  cpc_cents: { minimum: 0, type: ["integer", "null"] },
  difficulty: { maximum: 100, minimum: 0, type: ["integer", "null"] },
  intent: {
    enum: ["informational", "commercial", "transactional", "navigational", "unknown", null],
    type: "string",
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
  properties: {
    cached: { type: "boolean" },
    cost_cents: { minimum: 0, type: "number" },
    reason: { enum: sourceReasons, type: "string" },
    returned: { minimum: 0, type: "integer" },
    source: { enum: ["related", "suggestion", "idea"], type: "string" },
    status: { enum: ["ok", "failed", "skipped"], type: "string" },
  },
  required: ["cached", "cost_cents", "returned", "source", "status"],
  type: "object",
};

const domainOverviewReportProperties = {
  cached: { type: "boolean" },
  cost_cents: { minimum: 0, type: "number" },
  country_code: { type: ["string", "null"] },
  data_state: { description: dataStateDesc, enum: ["no_data", "ok", "partial"], type: "string" },
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
  scope: { enum: ["root", "subdomain"], type: "string" },
  source_snapshot_at: nullableDate,
  stale: { type: "boolean" },
  state: { description: domainOverviewStateDesc, enum: ["fresh", "stale"], type: "string" },
  target: { type: "string" },
};

const keywordResearchReportProperties = {
  cached: { type: "boolean" },
  cost_cents: { minimum: 0, type: "number" },
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
      properties: {
        already_saved: { type: "boolean" },
        already_tracked: { type: "boolean" },
        keyword: { type: "string" },
        source: { enum: ["related", "suggestion", "idea"], type: "string" },
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

export const researchReportsSchemas = {
  StoredBacklinksReport: {
    allOf: [ref("BacklinksSnapshot"), storageFields],
  },
  StoredDomainOverviewReport: {
    properties: domainOverviewReportProperties,
    required: Object.keys(domainOverviewReportProperties),
    type: "object",
  },
  StoredKeywordResearchReport: {
    properties: keywordResearchReportProperties,
    required: Object.keys(keywordResearchReportProperties),
    type: "object",
  },
  StoredResearchReportSummary: {
    properties: {
      country_code: { type: "string" },
      fresh_until: freshUntilSchema,
      include_clickstream: { type: "boolean" },
      include_subdomains: { type: "boolean" },
      kind: { enum: ["backlinks", "domain_overview", "keyword_research"], type: "string" },
      language_code: { type: "string" },
      location_code: { type: "integer" },
      mode: { type: "string" },
      result_limit: { type: "integer" },
      saved_at: dateSchema,
      seed: { type: "string" },
      state: freshnessSchema,
      target: { type: "string" },
      target_scope: {
        description: "site or page for backlinks, root or subdomain for domain overviews.",
        type: "string",
      },
    },
    required: ["kind", "saved_at", "fresh_until", "state"],
    type: "object",
  },
  StoredResearchReportsResponse: {
    properties: {
      data: { items: ref("StoredResearchReportSummary"), type: "array" },
      meta: {
        properties: {
          freshness_days: {
            description: freshnessDesc,
            type: "integer",
          },
        },
        required: ["freshness_days"],
        type: "object",
      },
    },
    required: ["data", "meta"],
    type: "object",
  },
  StoredResearchReportResponse: {
    properties: {
      data: {
        oneOf: [
          ref("StoredBacklinksReport"),
          ref("StoredDomainOverviewReport"),
          ref("StoredKeywordResearchReport"),
        ],
      },
    },
    required: ["data"],
    type: "object",
  },
} as const;

function queryParameter(name: string, description: string, schema: object) {
  return { description, in: "query", name, schema };
}

const reportParameters = [
  {
    description: "Report kind. The remaining query parameters are validated per kind.",
    in: "path",
    name: "kind",
    required: true,
    schema: { enum: ["backlinks", "domain_overview", "keyword_research"], type: "string" },
  },
  queryParameter("target", "Stored target; required for backlinks and domain overviews.", {
    type: "string",
  }),
  queryParameter("target_scope", "site or page for backlinks; root or subdomain for overviews.", {
    type: "string",
  }),
  queryParameter("mode", "Backlinks row mode or keyword research mode as stored.", {
    type: "string",
  }),
  queryParameter("include_subdomains", "Backlinks include-subdomains flag as stored.", {
    default: true,
    type: "boolean",
  }),
  queryParameter("seed", "Keyword research seed as stored. Required for keyword research.", {
    type: "string",
  }),
  queryParameter("include_clickstream", "Keyword research clickstream flag as stored.", {
    default: false,
    type: "boolean",
  }),
  queryParameter("result_limit", "Keyword research result limit as stored.", {
    default: 100,
    enum: [100, 300, 500],
    type: "integer",
  }),
  queryParameter(
    "connection_id",
    "Provider connection public ID used when the report was stored.",
    { type: "string" },
  ),
  queryParameter("language_code", "Domain overview language code as stored.", { type: "string" }),
  queryParameter("location_code", "Domain overview location code as stored.", { type: "integer" }),
];

const readDescription =
  "Read-only view of a report that is already stored. Reads never call a provider and never require a connected provider. A report is fresh while now is before fresh_until.";

export function researchReportsPaths(input: { bearer: Bearer }) {
  return {
    "/projects/{project_id}/research/reports": {
      get: {
        ...input.bearer(
          "List stored research reports",
          "listStoredResearchReports",
          ref("StoredResearchReportsResponse"),
        ),
        description: readDescription,
      },
    },
    "/projects/{project_id}/research/reports/{kind}": {
      get: {
        ...input.bearer(
          "Read a stored research report",
          "getStoredResearchReport",
          ref("StoredResearchReportResponse"),
          undefined,
          reportParameters,
        ),
        description: readDescription,
      },
    },
  };
}
