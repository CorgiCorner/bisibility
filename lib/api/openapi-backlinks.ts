type Bearer = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
  parameters?: object[],
) => object;

type BacklinksSchemaName = "BacklinksResponse" | "BacklinksRowsRequest" | "BacklinksSnapshot";

const ref = (name: BacklinksSchemaName) => ({
  $ref: `#/components/schemas/${name}`,
});

const problemResponse = (description: string) => ({
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/Problem" } },
  },
  description,
});

function withBacklinksMetadata(
  operation: object,
  description: string,
  conflictDescription?: string,
) {
  const responses = (operation as { responses: Record<string, object> }).responses;
  return {
    ...operation,
    description,
    responses: {
      ...responses,
      ...(conflictDescription ? { "409": problemResponse(conflictDescription) } : {}),
      "422": problemResponse(
        "unsupported_target from local validation before any paid call, needs_reauth, or cost_limit_exceeded",
      ),
      "429": problemResponse("budget_exhausted, in_progress, or rate_limited"),
    },
  };
}

function withRequiredBody(operation: object) {
  const requestBody = (operation as { requestBody?: object }).requestBody;
  return requestBody
    ? { ...operation, requestBody: { ...requestBody, required: true } }
    : operation;
}

const backlinksSummary = {
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

const backlinkHistory = {
  items: {
    properties: {
      lost_links: { minimum: 0, type: "integer" },
      month: { pattern: "^\\d{4}-(0[1-9]|1[0-2])$", type: "string" },
      new_links: { minimum: 0, type: "integer" },
    },
    required: ["month", "new_links", "lost_links"],
    type: "object",
  },
  maxItems: 12,
  minItems: 12,
  type: "array",
} as const;

const backlinkRows = {
  items: {
    properties: {
      anchor: { type: "string" },
      domain_authority: {
        description: "Referring domain authority from provider domain_from_rank.",
        maximum: 100,
        minimum: 0,
        type: "integer",
      },
      first_seen: { format: "date", type: "string" },
      flags: {
        description: "sitewide is derived from a links_count heuristic.",
        items: {
          enum: ["nofollow", "ugc", "sponsored", "image", "sitewide"],
          type: "string",
        },
        type: "array",
        uniqueItems: true,
      },
      links_count: { minimum: 0, type: "integer" },
      lost_at: {
        description: "Provider lost_date, verbatim.",
        format: "date",
        type: ["string", "null"],
      },
      source_domain: { type: "string" },
      source_url: { type: "string" },
      spam_score: { minimum: 0, type: "number" },
      status: {
        description: "Derived from provider is_new and is_lost.",
        enum: ["active", "new", "lost"],
        type: "string",
      },
      target_url: { type: "string" },
    },
    required: [
      "source_domain",
      "source_url",
      "anchor",
      "target_url",
      "flags",
      "domain_authority",
      "spam_score",
      "links_count",
      "first_seen",
      "lost_at",
      "status",
    ],
    type: "object",
  },
  type: "array",
} as const;

export const backlinksSchemas = {
  BacklinksResponse: {
    properties: { data: ref("BacklinksSnapshot") },
    required: ["data"],
    type: "object",
  },
  BacklinksRowsRequest: {
    properties: {
      include_subdomains: { type: "boolean" },
      limit: { maximum: 1000, minimum: 100, multipleOf: 100, type: "integer" },
      target: { type: "string" },
      target_scope: { enum: ["site", "page"], type: "string" },
    },
    required: ["target", "target_scope", "include_subdomains", "limit"],
    type: "object",
  },
  BacklinksSnapshot: {
    properties: {
      cached: { type: "boolean" },
      cached_until: { format: "date-time", type: "string" },
      cost_cents: { minimum: 0, type: "number" },
      estimate: { type: "boolean" },
      estimated_cost_cents: { minimum: 0, type: "number" },
      fetched_at: { format: "date-time", type: "string" },
      fetched_row_count: { minimum: 0, type: "integer" },
      history: backlinkHistory,
      include_subdomains: { type: "boolean" },
      provider: { type: "string" },
      rows: backlinkRows,
      summary: backlinksSummary,
      target: { type: "string" },
      target_scope: { enum: ["site", "page"], type: "string" },
      total_rows_available: { minimum: 0, type: "integer" },
    },
    required: [
      "target",
      "target_scope",
      "include_subdomains",
      "cached",
      "fetched_at",
      "cached_until",
      "provider",
      "cost_cents",
      "summary",
      "history",
      "rows",
      "fetched_row_count",
      "total_rows_available",
    ],
    type: "object",
  },
} as const;

const queryParameters = [
  {
    description: "Domain for site scope or full URL for page scope.",
    in: "query",
    name: "target",
    required: true,
    schema: { type: "string" },
  },
  {
    in: "query",
    name: "target_scope",
    schema: { default: "site", enum: ["site", "page"], type: "string" },
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
    schema: { default: 100, enum: [100, 300, 500, 1000], type: "integer" },
  },
  {
    description: "Provider-side row mode applied over the full corpus.",
    in: "query",
    name: "mode",
    schema: {
      default: "as_is",
      enum: ["as_is", "one_per_domain"],
      type: "string",
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
    description: "Best-effort pre-estimate provider cost gate, in cents.",
    in: "query",
    name: "max_cost_cents",
    schema: { minimum: 1, type: "integer" },
  },
];

export function backlinksPaths(input: { bearer: Bearer }) {
  return {
    "/projects/{projectId}/backlinks": {
      get: withBacklinksMetadata(
        input.bearer(
          "Analyze backlinks or return a free estimate. Requires write scope.",
          "analyzeBacklinks",
          ref("BacklinksResponse"),
          undefined,
          queryParameters,
        ),
        'Requires write scope because cache misses spend provider budget. estimate_only is a free dry run, and max_cost_cents is a best-effort pre-estimate gate. Snapshots are cached for 24 hours. Aggregated referring-domain, page, and anchor views are consumer-side and must be labeled "within fetched rows".',
      ),
    },
    "/projects/{projectId}/backlinks/rows": {
      post: withBacklinksMetadata(
        withRequiredBody(
          input.bearer(
            "Load more rows into an unexpired backlinks snapshot. Requires write scope.",
            "loadMoreBacklinkRows",
            ref("BacklinksResponse"),
            ref("BacklinksRowsRequest"),
          ),
        ),
        "Extends the current unexpired snapshot. The response contains only newly fetched rows plus the updated fetched_row_count and cost_cents.",
        "snapshot_expired: no unexpired backlinks snapshot exists",
      ),
    },
  };
}
