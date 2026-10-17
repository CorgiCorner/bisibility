type Bearer = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
  parameters?: object[],
) => object;

import {
  backlinksFailedSummaryProblem,
  withBacklinksFailedSummaryProblem,
} from "./openapi-backlinks-failure";
import {
  backlinksEstimateSchema,
  backlinksQueryParameters,
  backlinksSummary,
} from "./openapi-backlinks-parts";
import { withCreditsExhausted } from "./openapi-operations";

type BacklinksSchemaName =
  | "BacklinksEstimate"
  | "BacklinksResponse"
  | "BacklinksRowsRequest"
  | "BacklinksSnapshot"
  | "BacklinksSnapshotResponse";

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
  return withCreditsExhausted({
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
  });
}

function withRequiredBody(operation: object) {
  const requestBody = (operation as { requestBody?: object }).requestBody;
  return requestBody
    ? { ...operation, requestBody: { ...requestBody, required: true } }
    : operation;
}

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
  BacklinksFailedSummaryProblem: backlinksFailedSummaryProblem,
  BacklinksEstimate: backlinksEstimateSchema,
  BacklinksResponse: {
    properties: { data: { oneOf: [ref("BacklinksEstimate"), ref("BacklinksSnapshot")] } },
    required: ["data"],
    type: "object",
  },
  BacklinksRowsRequest: {
    properties: {
      snapshot_ref: {
        type: "string",
        description:
          "Opaque snapshot_ref from the report being extended. Missing or stale references return snapshot_expired before paid I/O.",
      },
      include_subdomains: { type: "boolean" },
      limit: { maximum: 1000, minimum: 100, multipleOf: 100, type: "integer" },
      target: { type: "string" },
      target_scope: { enum: ["site", "page"], type: "string" },
    },
    required: ["target", "target_scope", "include_subdomains", "limit"],
    type: "object",
  },
  BacklinksSnapshot: {
    oneOf: [
      {
        properties: {
          history: { maxItems: 12 },
          history_unavailable: { const: false },
          target_scope: { const: "site" },
        },
        required: ["target_scope"],
      },
      {
        properties: {
          history: { maxItems: 0 },
          history_unavailable: { const: true },
        },
        required: ["history_unavailable"],
      },
      {
        properties: {
          history: { maxItems: 0 },
          history_unavailable: { const: false },
          target_scope: { const: "page" },
        },
        required: ["target_scope"],
      },
    ],
    properties: {
      snapshot_ref: {
        type: "string",
        description: "Opaque reference for extending this exact snapshot revision.",
      },
      cached: { type: "boolean" },
      cached_until: { format: "date-time", type: "string" },
      cost_cents: { minimum: 0, type: "number" },
      fetched_at: { format: "date-time", type: "string" },
      fetched_row_count: { minimum: 0, type: "integer" },
      history: backlinkHistory,
      history_unavailable: {
        type: "boolean",
        description:
          "True only with empty history when the optional history request failed with a confirmed cost. Successful site history can contain zero to twelve returned months; page scope does not request history. Summary and links remain available.",
      },
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
  BacklinksSnapshotResponse: {
    properties: { data: ref("BacklinksSnapshot") },
    required: ["data"],
    type: "object",
  },
} as const;

export function backlinksPaths(input: { bearer: Bearer }) {
  return {
    "/projects/{projectId}/backlinks": {
      get: withBacklinksFailedSummaryProblem(
        withBacklinksMetadata(
          input.bearer(
            "Analyze backlinks or return a free estimate. Requires write scope.",
            "analyzeBacklinks",
            ref("BacklinksResponse"),
            undefined,
            backlinksQueryParameters,
          ),
          'Requires write scope because cache misses spend provider budget. estimate_only=true needs only read scope and never spends provider budget. estimate_only is a free dry run, and max_cost_cents limits admitted cost estimates across summary, history, rows and retries. Confirmed provider charges can differ from estimates. Snapshots are cached for 24 hours. Aggregated referring-domain, page, and anchor views are consumer-side and must be labeled "within fetched rows".',
        ),
      ),
    },
    "/projects/{projectId}/backlinks/rows": {
      post: withBacklinksMetadata(
        withRequiredBody(
          input.bearer(
            "Load more rows into an unexpired backlinks snapshot. Requires write scope.",
            "loadMoreBacklinkRows",
            ref("BacklinksSnapshotResponse"),
            ref("BacklinksRowsRequest"),
          ),
        ),
        "Extends the unexpired snapshot identified by snapshot_ref. Pass the reference returned by analyzeBacklinks or the previous loadMoreBacklinkRows response. The response contains only newly fetched rows plus the updated snapshot_ref, fetched_row_count and cost_cents.",
        "snapshot_expired: the reference is missing, invalid, stale, outside the project scope, or expired; no paid request is dispatched",
      ),
    },
  };
}
