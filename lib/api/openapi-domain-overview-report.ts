const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const nonnegativeNumber = { minimum: 0, type: "number" };

const moduleFailure = {
  properties: {
    cost_cents: nonnegativeNumber,
    ok: { const: false, type: "boolean" },
    reason: {
      enum: [
        "budget_exhausted",
        "cost_limit_exceeded",
        "in_progress",
        "lookup_failed",
        "needs_reauth",
        "no_source",
        "rate_limited",
        "snapshot_expired",
        "unsupported_location",
      ],
      type: "string",
    },
    reset_at: { type: "number" },
  },
  required: ["ok", "reason", "cost_cents"],
  type: "object",
};

function moduleSuccess(data: object) {
  return {
    properties: {
      cached: { type: "boolean" },
      cost_cents: nonnegativeNumber,
      data,
      fetched_at: { format: "date-time", type: "string" },
      ok: { const: true, type: "boolean" },
    },
    required: ["ok", "cached", "cost_cents", "data", "fetched_at"],
    type: "object",
  };
}

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
      cached: { type: "boolean" },
      cached_until: { format: "date-time", type: "string" },
      cost_cents: nonnegativeNumber,
      fetched_at: { format: "date-time", type: "string" },
      history_mode: { const: "lazy", type: "string" },
      keywords: {
        oneOf: [
          moduleSuccess(ref("DomainOverviewKeywordsData")),
          ref("DomainOverviewModuleFailure"),
        ],
      },
      language_code: { type: "string" },
      location_code: { type: "integer" },
      overview: { oneOf: [ref("DomainOverviewMetrics"), { type: "null" }] },
      pages: {
        oneOf: [moduleSuccess(ref("DomainOverviewPagesData")), ref("DomainOverviewModuleFailure")],
      },
      previous_fetched_at: { format: "date-time", type: ["string", "null"] },
      previous_overview: { oneOf: [ref("DomainOverviewMetrics"), { type: "null" }] },
      previous_source_snapshot_at: { format: "date-time", type: ["string", "null"] },
      provider: { type: "string" },
      scope: { enum: ["root", "subdomain"], type: "string" },
      source_snapshot_at: { format: "date-time", type: ["string", "null"] },
      state: { enum: ["no_data", "ok", "partial"], type: "string" },
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
