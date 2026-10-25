import { mcpPublicIdSchema } from "./public-id-schema";

const project = {
  project_id: {
    ...mcpPublicIdSchema("prj"),
    description: "Project with an existing Search Console connection.",
  },
};
const state =
  "Results are Google's indexed state as already known to Google, not a live test, and may be partial or delayed.";
export const searchIndexDescriptions = {
  listSearchIndexSitemaps: `List Page indexing sitemaps from the project's connected property. ${state}`,
  getSearchIndexSitemap: `Get one Page indexing sitemap from the project's connected property. The sitemap URL must belong to that property. ${state}`,
  inspectSearchIndexUrls: `Explicitly inspect 1-10 URLs in the project's connected property and store the full latest fields and changes. URLs are normalized and validated before any Google call; duplicates after normalization count once. Write scope is required. Every URL sent to Google counts, even when the call fails; URLs admitted but not sent because the batch stopped are released. Manual and background inspections share one project daily inspection allowance that resets at Pacific midnight; both also share a persistent property counter. This is an estimate because other tools consume quota too. Per-URL failures are returned; provider_rate_limited includes reset_at (ISO timestamp) and scope (daily, minute or unknown), and stops further calls in the batch. ${state}`,
};

export const searchIndexToolSchemas = {
  listSearchIndexSitemaps: {
    additionalProperties: false,
    properties: project,
    required: ["project_id"],
    type: "object",
  },
  getSearchIndexSitemap: {
    additionalProperties: false,
    properties: {
      ...project,
      path: {
        description: "Full sitemap URL within the connected property.",
        minLength: 1,
        maxLength: 2048,
        type: "string",
      },
    },
    required: ["project_id", "path"],
    type: "object",
  },
  inspectSearchIndexUrls: {
    additionalProperties: false,
    properties: {
      ...project,
      urls: {
        description:
          "1-10 HTTP(S) URLs within the connected property; URLs are normalized and duplicates after normalization count once.",
        items: { type: "string", minLength: 1, maxLength: 2048 },
        minItems: 1,
        maxItems: 10,
        type: "array",
      },
      idempotency_key: {
        description: "Reuse this key to replay the response without another inspection.",
        type: "string",
        minLength: 1,
        maxLength: 200,
      },
    },
    required: ["project_id", "urls"],
    type: "object",
  },
};
