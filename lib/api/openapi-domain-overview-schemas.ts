import {
  domainOverviewReportSchemas,
  domainOverviewScope,
  echoedLimit,
} from "./openapi-domain-overview-report";
import {
  closedEnum,
  constraintUnion,
  openEnum,
  sdkName,
  taggedUnion,
  usdCents,
} from "./openapi-sdk-schema";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const nullableNumber = { type: ["number", "null"] };
const nonnegativeInteger = { minimum: 0, type: "integer" };
const nonnegativeNumber = { minimum: 0, type: "number" };
const cents = { ...nonnegativeNumber, ...usdCents };
const nullableCents = { ...nullableNumber, ...usdCents };

const metricsProperties = {
  count: { type: ["integer", "null"] },
  estimated_traffic_cost_cents: nullableCents,
  etv: nullableNumber,
  is_down: nonnegativeInteger,
  is_lost: nonnegativeInteger,
  is_new: nonnegativeInteger,
  is_up: nonnegativeInteger,
  pos1: nonnegativeInteger,
  pos2_3: nonnegativeInteger,
  pos4_10: nonnegativeInteger,
  pos11_20: nonnegativeInteger,
  pos21_30: nonnegativeInteger,
  pos31_40: nonnegativeInteger,
  pos41_50: nonnegativeInteger,
  pos51_60: nonnegativeInteger,
  pos61_70: nonnegativeInteger,
  pos71_80: nonnegativeInteger,
  pos81_90: nonnegativeInteger,
  pos91_100: nonnegativeInteger,
};

const metricsRequired = Object.keys(metricsProperties);

const commonRequestProperties = {
  fresh: { default: false, type: "boolean" },
  language_code: { maxLength: 12, minLength: 2, type: "string" },
  location_code: { minimum: 1, type: "integer" },
  scope_override: {
    enum: ["root", "subdomain"],
    type: "string",
    ...closedEnum("DomainOverviewScopeOverride"),
  },
  target: { maxLength: 253, minLength: 1, type: "string" },
};

const commonRequestRequired = ["target", "location_code", "language_code"];

function topLevelModule(data: object, name: string) {
  return {
    properties: {
      cached: { type: "boolean" },
      cost_cents: cents,
      data,
      fetched_at: { format: "date-time", type: ["string", "null"] },
    },
    required: ["cached", "cost_cents", "data", "fetched_at"],
    type: "object",
    ...sdkName(name),
  };
}

function dataEnvelope(data: object) {
  return {
    properties: { data },
    required: ["data"],
    type: "object",
  };
}

const rankedKeywordRow = {
  properties: {
    cpc_cents: nullableCents,
    difficulty: nullableNumber,
    estimated_traffic: nullableNumber,
    intent: {
      enum: ["informational", "navigational", "commercial", "transactional", null],
      type: ["string", "null"],
      ...openEnum("DomainOverviewKeywordIntent"),
    },
    keyword: { type: "string" },
    position: nullableNumber,
    rank_absolute: nullableNumber,
    rank_absolute_delta: nullableNumber,
    ranking_url: { type: ["string", "null"] },
    search_volume: nullableNumber,
    serp_features: { items: { type: "string" }, type: "array" },
  },
  required: [
    "keyword",
    "position",
    "search_volume",
    "estimated_traffic",
    "cpc_cents",
    "difficulty",
    "intent",
    "ranking_url",
    "serp_features",
    "rank_absolute_delta",
    "rank_absolute",
  ],
  type: "object",
  ...sdkName("DomainOverviewKeywordRow"),
};

const relevantPageRow = {
  properties: {
    etv: nullableNumber,
    etv_delta_pct: nullableNumber,
    keyword_count: { type: ["integer", "null"] },
    path: { type: "string" },
    top_keyword: { type: ["string", "null"] },
    top_keyword_position: nullableNumber,
  },
  required: [
    "path",
    "etv",
    "etv_delta_pct",
    "keyword_count",
    "top_keyword",
    "top_keyword_position",
  ],
  type: "object",
  ...sdkName("DomainOverviewPageRow"),
};

export const domainOverviewSchemas = {
  DomainOverviewAnalyzeRequest: {
    additionalProperties: false,
    anyOf: [
      { properties: { estimate_only: { const: true } }, required: ["estimate_only"] },
      { properties: { estimate_only: { const: false } }, required: ["max_cost_cents"] },
    ],
    ...constraintUnion,
    properties: {
      ...commonRequestProperties,
      estimate_only: { default: false, type: "boolean" },
      keyword_limit: { default: 100, maximum: 100, minimum: 1, type: "integer" },
      max_cost_cents: {
        description: "Required for paid analysis; estimate_only may omit it.",
        minimum: 0,
        type: "integer",
        ...usdCents,
      },
      page_limit: { default: 100, maximum: 1_000, minimum: 1, type: "integer" },
    },
    required: commonRequestRequired,
    type: "object",
  },
  DomainOverviewAnalyzeResponse: dataEnvelope({
    oneOf: [ref("DomainOverviewEstimate"), ref("DomainOverviewReport")],
    ...taggedUnion("estimate", ["estimate", "report"]),
    ...sdkName("DomainOverviewAnalyzeResult"),
  }),
  DomainOverviewEstimate: {
    properties: {
      cached: { type: "boolean" },
      estimate: { const: true, type: "boolean" },
      estimated_cost_cents: cents,
      fresh_estimated_cost_cents: cents,
      history_estimated_cost_cents: cents,
      history_mode: { const: "lazy", type: "string" },
      keyword_limit: echoedLimit,
      keyword_page_estimated_cost_cents: cents,
      language_code: { type: "string" },
      location_code: { type: "integer" },
      page_limit: echoedLimit,
      page_page_estimated_cost_cents: cents,
      provider: { type: "string" },
      scope: domainOverviewScope,
      target: { type: "string" },
    },
    required: [
      "cached",
      "estimate",
      "estimated_cost_cents",
      "fresh_estimated_cost_cents",
      "history_estimated_cost_cents",
      "history_mode",
      "keyword_page_estimated_cost_cents",
      "page_page_estimated_cost_cents",
      "provider",
      "target",
      "scope",
      "location_code",
      "language_code",
    ],
    type: "object",
  },
  DomainOverviewHistoryRequest: {
    additionalProperties: false,
    properties: {
      ...commonRequestProperties,
      max_cost_cents: { ...nonnegativeInteger, ...usdCents },
    },
    required: [...commonRequestRequired, "max_cost_cents"],
    type: "object",
  },
  DomainOverviewHistoryResponse: dataEnvelope({
    ...sdkName("DomainOverviewHistoryModule"),
    properties: {
      cached: { type: "boolean" },
      cost_cents: cents,
      data: { items: ref("DomainOverviewHistoricalRow"), type: "array" },
      fetched_at: { format: "date-time", type: ["string", "null"] },
    },
    required: ["cached", "cost_cents", "data", "fetched_at"],
    type: "object",
  }),
  DomainOverviewHistoricalRow: {
    properties: {
      metrics: ref("DomainOverviewMetrics"),
      month: { maximum: 12, minimum: 1, type: "integer" },
      year: { type: "integer" },
    },
    required: ["year", "month", "metrics"],
    type: "object",
  },
  DomainOverviewKeywordsData: {
    properties: {
      cost_cents: cents,
      rows: { items: rankedKeywordRow, type: "array" },
      total_count: { type: ["integer", "null"] },
    },
    required: ["rows", "total_count", "cost_cents"],
    type: "object",
  },
  DomainOverviewKeywordsResponse: dataEnvelope(
    topLevelModule(ref("DomainOverviewKeywordsData"), "DomainOverviewKeywordsPageModule"),
  ),
  DomainOverviewMetrics: {
    properties: metricsProperties,
    required: metricsRequired,
    type: "object",
  },
  DomainOverviewKeywordsRequest: {
    additionalProperties: false,
    properties: {
      ...commonRequestProperties,
      limit: { maximum: 100, minimum: 1, type: "integer" },
      max_cost_cents: { ...nonnegativeInteger, ...usdCents },
      offset: nonnegativeInteger,
    },
    required: [...commonRequestRequired, "limit", "offset", "max_cost_cents"],
    type: "object",
  },
  DomainOverviewPagesRequest: {
    additionalProperties: false,
    properties: {
      ...commonRequestProperties,
      limit: { maximum: 1_000, minimum: 1, type: "integer" },
      max_cost_cents: { ...nonnegativeInteger, ...usdCents },
      offset: nonnegativeInteger,
    },
    required: [...commonRequestRequired, "limit", "offset", "max_cost_cents"],
    type: "object",
  },
  DomainOverviewPagesData: {
    properties: {
      cost_cents: cents,
      rows: { items: relevantPageRow, type: "array" },
      total_count: nonnegativeInteger,
    },
    required: ["rows", "total_count", "cost_cents"],
    type: "object",
  },
  DomainOverviewPagesResponse: dataEnvelope(
    topLevelModule(ref("DomainOverviewPagesData"), "DomainOverviewPagesPageModule"),
  ),
  ...domainOverviewReportSchemas,
} as const;
