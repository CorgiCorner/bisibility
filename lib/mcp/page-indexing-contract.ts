import { mcpPublicIdSchema } from "./public-id-schema";

const project = {
  project_id: {
    ...mcpPublicIdSchema("prj"),
    description: "Project with a connected Search Console property.",
  },
};
const read = {
  type: "object",
  additionalProperties: false,
  properties: project,
  required: ["project_id"],
};
const state =
  "Stored results are Google's indexed state, not a live test, and may be partial. This operation never calls Google.";
export const pageIndexingDescriptions = {
  getPageIndexingReport: `Read the Page indexing report, reasons, completeness and freshness overall and per group, plus the estimated shared property usage and Pacific reset. ${state}`,
  listPageIndexingUrls: `List stored Page indexing URLs from current sitemaps and keyword targets; manual-only URLs are included only with source=manual. Synthetic groups have a null coverage_state reason; filter them by group alone. List with filters, cursor pagination and optional history (latest 100 changes per URL, with a completeness flag). ${state}`,
  getPageIndexingSettings: `Read Page indexing budget settings, deployment-supported modes and estimated shared property usage. ${state}`,
  updatePageIndexingSettings: `Update Page indexing background inspection settings. off disables background inspection; fixed uses a project daily limit of 0-2000; available_quota is self-host only and runs until a daily 429 within the run time budget. Manual and background calls share the property counter, reset at Pacific midnight. ${state}`,
};

export const pageIndexingToolSchemas = {
  getPageIndexingReport: read,
  getPageIndexingSettings: read,
  listPageIndexingUrls: {
    ...read,
    properties: {
      ...project,
      group: {
        type: "string",
        enum: ["indexed", "not_indexed", "inspection_failed", "not_checked"],
        description: "Stored result group.",
      },
      coverage_state: {
        type: "string",
        maxLength: 500,
        description:
          "Exact Google coverage state; Unspecified matches a missing state in indexed/not_indexed groups. For inspection_failed and not_checked, filter by group alone.",
      },
      sitemap: { type: "string", maxLength: 2048, description: "Sitemap that listed the URL." },
      source: {
        type: "string",
        enum: ["keyword_target", "sitemap", "manual"],
        description:
          "Candidate or inspection source. Manual-only URLs are included only when source=manual is explicitly requested.",
      },
      search: { type: "string", maxLength: 500, description: "Case-insensitive URL substring." },
      changed_since: {
        type: "string",
        format: "date-time",
        description:
          "Include URLs with a stored tracked change at or after this timestamp, before pagination.",
      },
      cursor: {
        type: "string",
        maxLength: 2048,
        description: "Opaque next_cursor from the previous page.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 50,
        description: "Maximum rows returned.",
      },
      history: {
        type: "string",
        enum: ["true", "false"],
        default: "false",
        description: "Include up to 100 recent changes per URL.",
      },
    },
  },
  updatePageIndexingSettings: {
    ...read,
    properties: {
      ...project,
      budget_mode: {
        type: "string",
        enum: ["off", "fixed", "available_quota"],
        description: "Background budget mode. available_quota is self-host only.",
      },
      inspection_daily_limit: {
        type: "integer",
        minimum: 0,
        maximum: 2000,
        description: "Fixed project daily allowance, reset at Pacific midnight.",
      },
      idempotency_key: {
        type: "string",
        description: "Replay an update response with this key.",
        minLength: 1,
        maxLength: 200,
      },
    },
  },
};
