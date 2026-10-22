import { paymentRequestFields, paymentResponseFields } from "./openapi-action-payment";
import { closedEnum, openEnum, sdkName, usdCents } from "./openapi-sdk-schema";

/** Site or page scope; shared by the request filter and every backlinks response. */
export const backlinksTargetScope = {
  enum: ["site", "page"],
  type: "string",
  ...openEnum("BacklinksTargetScope"),
} as const;

export const backlinksSummary = {
  properties: {
    backlinks_total: { minimum: 0, type: "integer" },
    broken_backlinks: { minimum: 0, type: "integer" },
    broken_pages: { minimum: 0, type: "integer" },
    dofollow_pct: { maximum: 100, minimum: 0, type: "number" },
    domain_rank: { maximum: 100, minimum: 0, type: "integer" },
    lost_backlinks: {
      description: "Provider-lifetime count.",
      minimum: 0,
      type: "integer",
    },
    lost_referring_domains: {
      description: "Provider-lifetime count.",
      minimum: 0,
      type: "integer",
    },
    new_backlinks: {
      description: "Provider-lifetime count.",
      minimum: 0,
      type: "integer",
    },
    new_referring_domains: {
      description: "Provider-lifetime count.",
      minimum: 0,
      type: "integer",
    },
    referring_domains_total: { minimum: 0, type: "integer" },
    referring_pages: { minimum: 0, type: "integer" },
    spam_score: { minimum: 0, type: "number" },
  },
  required: [
    "backlinks_total",
    "referring_domains_total",
    "domain_rank",
    "spam_score",
    "dofollow_pct",
    "referring_pages",
    "broken_backlinks",
    "broken_pages",
    "new_backlinks",
    "lost_backlinks",
    "new_referring_domains",
    "lost_referring_domains",
  ],
  type: "object",
  ...sdkName("BacklinksSummary"),
} as const;

/**
 * Free dry-run response for estimate_only=true. Kept next to, not inside, the snapshot schema so
 * the two shapes cannot drift into one object with optional report fields.
 */
export const backlinksEstimateSchema = {
  description:
    "Free dry run returned for estimate_only=true. It carries cost facts only and never report fields, so it cannot be mistaken for an empty backlink profile.",
  properties: {
    ...paymentResponseFields,
    cached: {
      description: "An unexpired snapshot exists, so the paid call would cost nothing.",
      type: "boolean",
    },
    cached_until: {
      description: "Expiry of that snapshot; null when there is none.",
      format: "date-time",
      type: ["string", "null"],
    },
    cost_cents: {
      description: "0 when cached, otherwise equal to estimated_cost_cents.",
      minimum: 0,
      type: "number",
      ...usdCents,
    },
    estimate: { const: true, type: "boolean" },
    estimated_cost_cents: { minimum: 0, type: "number", ...usdCents },
    include_subdomains: { type: "boolean" },
    provider: { type: "string" },
    target: { type: "string" },
    target_scope: backlinksTargetScope,
  },
  required: [
    "target",
    "target_scope",
    "include_subdomains",
    "cached",
    "cached_until",
    "provider",
    "cost_cents",
    "estimate",
    "estimated_cost_cents",
  ],
  type: "object",
} as const;

export const backlinksQueryParameters = [
  { in: "query", name: "payment_option_id", schema: paymentRequestFields.payment_option_id },
  {
    in: "query",
    name: "payment_quote_token",
    schema: { type: "string", minLength: 1, maxLength: 12000 },
  },
  { in: "query", name: "require_payment", schema: paymentRequestFields.require_payment },
  {
    description: "Domain for site scope or full URL for page scope.",
    in: "query",
    name: "target",
    required: true,
    schema: { minLength: 1, type: "string" },
  },
  {
    in: "query",
    name: "target_scope",
    schema: { default: "site", ...backlinksTargetScope },
  },
  {
    description: "Ignored when target_scope is page.",
    in: "query",
    name: "include_subdomains",
    schema: { default: true, type: "boolean" },
  },
  {
    in: "query",
    name: "result_limit",
    schema: {
      default: 100,
      enum: [100, 300, 500, 1000],
      type: "integer",
      ...closedEnum("BacklinksResultLimit"),
    },
  },
  {
    description: "Provider-side row mode applied over the full corpus.",
    in: "query",
    name: "mode",
    schema: {
      default: "as_is",
      enum: ["as_is", "one_per_domain"],
      type: "string",
      ...closedEnum("BacklinksMode"),
    },
  },
  {
    description: "Return a free cache-aware provider cost estimate without a paid call.",
    in: "query",
    name: "estimate_only",
    schema: { default: false, type: "boolean" },
  },
  { in: "query", name: "fresh", schema: { default: false, type: "boolean" } },
  {
    description:
      "Limit admitted cost estimates across summary, history, rows and retries, in cents. Confirmed provider charges can differ from estimates. 0 = cached result only; a miss returns cost_limit_exceeded with estimated_cost_cents before paid work.",
    in: "query",
    name: "max_cost_cents",
    schema: { minimum: 0, type: "integer", ...usdCents },
  },
];
