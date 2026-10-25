import { openEnum, sdkName } from "./openapi-sdk-schema";

const string = { type: "string" };
const nullableString = { type: ["string", "null"] };
const count = { type: "integer", minimum: 0 };
const strings = { type: "array", items: string };
const object = (properties: Record<string, object>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
});
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const state = (name: string) => ({ ...nullableString, ...sdkName(name) });
const sitemap = object({
  path: string,
  type: nullableString,
  is_sitemaps_index: { type: "boolean" },
  is_pending: { type: "boolean" },
  errors: count,
  warnings: count,
  last_submitted: nullableString,
  last_downloaded: nullableString,
  contents: {
    type: "array",
    items: {
      ...object({ type: string, submitted: count }),
      ...sdkName("SearchIndexSitemapContent"),
    },
  },
});
const richResults = {
  ...object({
    verdict: state("SearchIndexRichResultsVerdict"),
    detected_items: {
      type: "array",
      items: {
        ...object({
          rich_result_type: nullableString,
          item_count: count,
          issue_count: count,
          issues: {
            type: "array",
            items: {
              ...object({ severity: state("SearchIndexIssueSeverity"), count }),
              ...sdkName("SearchIndexIssueCount"),
            },
          },
        }),
        ...sdkName("SearchIndexDetectedItem"),
      },
    },
  }),
  type: ["object", "null"],
  ...sdkName("SearchIndexRichResults"),
};
const inspection = {
  ...object({
    verdict: state("SearchIndexVerdict"),
    coverage_state: nullableString,
    robots_txt_state: state("SearchIndexRobotsTxtState"),
    indexing_state: state("SearchIndexIndexingState"),
    last_crawl_time: nullableString,
    last_crawl_at: { type: ["string", "null"], format: "date-time" },
    page_fetch_state: state("SearchIndexPageFetchState"),
    google_canonical: nullableString,
    user_canonical: nullableString,
    crawled_as: state("SearchIndexCrawledAs"),
    referring_urls: strings,
    sitemap: strings,
    inspection_result_link: nullableString,
    rich_results_result: richResults,
  }),
  type: ["object", "null"],
};

const { "x-bisibility-name": _richResultsName, ...richResultsComponent } = richResults;

export const searchIndexSchemas = {
  SearchIndexSitemap: sitemap,
  PageIndexingRichResults: richResultsComponent,
  SearchIndexSitemaps: object({
    property: string,
    sitemaps: { type: "array", items: ref("SearchIndexSitemap") },
  }),
  SearchIndexSitemapResponse: object({ property: string, sitemap: ref("SearchIndexSitemap") }),
  SearchIndexInspectionInput: {
    ...object({
      urls: {
        type: "array",
        minItems: 1,
        maxItems: 10,
        items: { type: "string", minLength: 1, maxLength: 2048 },
      },
    }),
    additionalProperties: false,
  },
  SearchIndexInspection: inspection,
  SearchIndexInspectionError: {
    type: ["object", "null"],
    required: ["code", "message"],
    properties: {
      code: {
        type: "string",
        enum: [
          "inspection_daily_limit",
          "inspection_failed",
          "provider_authorization",
          "provider_rate_limited",
        ],
        ...openEnum("SearchIndexInspectionErrorCode"),
      },
      message: string,
      reset_at: {
        type: "string",
        format: "date-time",
        description: "Only provider_rate_limited errors include the provider reset time.",
      },
      scope: {
        type: "string",
        enum: ["daily", "minute", "unknown"],
        ...openEnum("SearchIndexRateLimitScope"),
        description: "Only provider_rate_limited errors include the provider rate-limit scope.",
      },
    },
  },
  SearchIndexInspections: object({
    property: string,
    results: {
      type: "array",
      items: {
        ...object({
          url: string,
          inspection: ref("SearchIndexInspection"),
          error: ref("SearchIndexInspectionError"),
        }),
        ...sdkName("SearchIndexInspectionRow"),
      },
    },
  }),
};
