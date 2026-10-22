import { DOMAIN_OVERVIEW_FAILURE_REASONS } from "@/lib/domain-overview/failure-details";
import { PROVIDER_ERROR_CODES } from "@/lib/providers/provider-error-code";
import { paymentReceiptWireSchema, paymentResponseFields } from "./openapi-action-payment";
import { openEnum, sdkName, taggedUnion, usdCents } from "./openapi-sdk-schema";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const nonnegativeNumber = { minimum: 0, type: "number" };
const cents = { ...nonnegativeNumber, ...usdCents };
export const domainOverviewScope = {
  enum: ["root", "subdomain"],
  type: "string",
  ...openEnum("DomainOverviewScope"),
};
export const echoedLimit = {
  description: "Requested page size, echoed from the analyze request.",
  minimum: 1,
  type: "integer",
};

const moduleFailure = {
  properties: {
    cost_cents: cents,
    ok: { const: false, type: "boolean" },
    reason: {
      enum: DOMAIN_OVERVIEW_FAILURE_REASONS,
      type: "string",
      ...openEnum("DomainOverviewFailureReason"),
    },
    phase: {
      enum: ["before_dispatch", "provider", "persistence"],
      type: "string",
      ...openEnum("DomainOverviewFailurePhase"),
    },
    provider_code: {
      enum: PROVIDER_ERROR_CODES,
      type: "string",
      ...openEnum("DomainOverviewProviderCode"),
    },
    reset_at: { type: "number" },
  },
  required: ["ok", "reason", "cost_cents"],
  type: "object",
};

function moduleSuccess(data: object, name: string) {
  return {
    properties: {
      cached: { type: "boolean" },
      cost_cents: cents,
      data,
      fetched_at: { format: "date-time", type: ["string", "null"] },
      ok: { const: true, type: "boolean" },
    },
    required: ["ok", "cached", "cost_cents", "data", "fetched_at"],
    type: "object",
    ...sdkName(name),
  };
}

/** A report module: its data, or the failure that kept it out (tagged by `ok`). */
const reportModule = (data: string, name: string) => ({
  oneOf: [moduleSuccess(ref(data), `${name}Success`), ref("DomainOverviewModuleFailure")],
  ...taggedUnion("ok", ["success", "failure"]),
  ...sdkName(name),
});

export const domainOverviewReportSchemas = {
  DomainOverviewModuleFailure: moduleFailure,
  DomainOverviewProblem: {
    allOf: [
      ref("Problem"),
      {
        properties: {
          errors: {
            properties: {
              cost_cents: nonnegativeNumber,
              reason: { type: "string" },
              phase: moduleFailure.properties.phase,
              provider_code: moduleFailure.properties.provider_code,
              reset_at: { type: ["number", "null"] },
            },
            required: ["reason", "cost_cents"],
            type: "object",
          },
        },
        required: ["errors"],
        type: "object",
      },
    ],
  },
  DomainOverviewReport: {
    properties: {
      ...paymentResponseFields,
      original_payment: paymentReceiptWireSchema,
      append_payment: paymentReceiptWireSchema,
      history_payment: paymentReceiptWireSchema,
      cached: { type: "boolean" },
      cached_until: { format: "date-time", type: "string" },
      cost_cents: cents,
      fetched_at: { format: "date-time", type: "string" },
      history_mode: { const: "lazy", type: "string" },
      keyword_limit: echoedLimit,
      keywords: reportModule("DomainOverviewKeywordsData", "DomainOverviewKeywordsModule"),
      language_code: { type: "string" },
      location_code: { type: "integer" },
      overview: { oneOf: [ref("DomainOverviewMetrics"), { type: "null" }] },
      page_limit: echoedLimit,
      pages: reportModule("DomainOverviewPagesData", "DomainOverviewPagesModule"),
      previous_fetched_at: { format: "date-time", type: ["string", "null"] },
      previous_overview: { oneOf: [ref("DomainOverviewMetrics"), { type: "null" }] },
      previous_source_snapshot_at: { format: "date-time", type: ["string", "null"] },
      provider: { type: "string" },
      scope: domainOverviewScope,
      source_snapshot_at: { format: "date-time", type: ["string", "null"] },
      state: {
        enum: ["no_data", "ok", "partial"],
        type: "string",
        ...openEnum("DomainOverviewReportState"),
      },
      target: { type: "string" },
    },
    required: [
      "cached",
      "cached_until",
      "cost_cents",
      "fetched_at",
      "history_mode",
      "keywords",
      "language_code",
      "location_code",
      "overview",
      "pages",
      "previous_fetched_at",
      "previous_overview",
      "previous_source_snapshot_at",
      "provider",
      "scope",
      "source_snapshot_at",
      "state",
      "target",
    ],
    type: "object",
  },
} as const;
