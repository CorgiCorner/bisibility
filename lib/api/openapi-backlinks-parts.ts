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
} as const;

/**
 * Free dry-run response for estimate_only=true. Kept next to, not inside, the snapshot schema so
 * the two shapes cannot drift into one object with optional report fields.
 */
export const backlinksEstimateSchema = {
  description:
    "Free dry run returned for estimate_only=true. It carries cost facts only and never report fields, so it cannot be mistaken for an empty backlink profile.",
  properties: {
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
    },
    estimate: { const: true, type: "boolean" },
    estimated_cost_cents: { minimum: 0, type: "number" },
    include_subdomains: { type: "boolean" },
    provider: { type: "string" },
    target: { type: "string" },
    target_scope: { enum: ["site", "page"], type: "string" },
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
