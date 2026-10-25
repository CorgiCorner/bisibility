import { pageIndexingToolSchemas } from "@/lib/mcp/page-indexing-contract";
import { closedEnum, openEnum, sdkName } from "./openapi-sdk-schema";

const string = { type: "string" };
const nullable = { type: ["string", "null"] };
const count = { type: "integer", minimum: 0 };
const date = { type: ["string", "null"], format: "date-time" };
const object = (properties: Record<string, object>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
});
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const budget = {
  budget_mode: {
    type: "string",
    enum: ["off", "fixed", "available_quota"],
    ...openEnum("PageIndexingBudgetMode"),
  },
  today_count: count,
  last429_kind: nullable,
  next_reset_at: { type: "string", format: "date-time" },
};
const freshness = {
  checked: count,
  total: count,
  complete: { type: "boolean" },
  remaining: count,
  oldest_result_at: date,
  newest_result_at: date,
};
const tracked = object({
  verdict: nullable,
  coverage_state: nullable,
  google_canonical: nullable,
  indexing_state: nullable,
  robots_txt_state: nullable,
  page_fetch_state: nullable,
});
const settings = object({
  property: string,
  ...budget,
  inspection_daily_limit: { type: "integer", minimum: 0, maximum: 2000 },
  available_modes: { type: "array", items: budget.budget_mode },
  last429_at: date,
});
export const pageIndexingSchemas = {
  PageIndexingSettings: settings,
  PageIndexingSettingsPatch: {
    type: "object",
    additionalProperties: false,
    minProperties: 1,
    properties: {
      budget_mode: {
        type: "string",
        enum: ["off", "fixed", "available_quota"],
        ...closedEnum("PageIndexingBudgetModeInput"),
      },
      inspection_daily_limit: settings.properties.inspection_daily_limit,
    },
  },
  PageIndexingReport: object({
    property: string,
    ...freshness,
    ...budget,
    discovery_complete: { type: "boolean" },
    discovered_at: date,
    estimated_days_remaining: { type: ["integer", "null"], minimum: 0 },
    groups: {
      type: "array",
      items: {
        ...object({
          group: {
            ...pageIndexingToolSchemas.listPageIndexingUrls.properties.group,
            ...openEnum("PageIndexingGroupKind"),
          },
          ...freshness,
          ...budget,
          reasons: {
            type: "array",
            items: {
              ...object({ coverage_state: nullable, total: count, oldest_result_at: date }),
              ...sdkName("PageIndexingReason"),
            },
          },
        }),
        ...sdkName("PageIndexingGroup"),
      },
    },
  }),
  PageIndexingTrackedState: tracked,
  PageIndexingUrl: object({
    url: string,
    verdict: nullable,
    coverage_state: nullable,
    last_crawl_at: date,
    canonical_ok: { type: ["boolean", "null"] },
    checked_at: date,
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
    source: {
      ...pageIndexingToolSchemas.listPageIndexingUrls.properties.source,
      ...openEnum("PageIndexingSource"),
    },
    sitemap_url: nullable,
    google_canonical: nullable,
    user_canonical: nullable,
    indexing_state: nullable,
    robots_txt_state: nullable,
    page_fetch_state: nullable,
    crawled_as: nullable,
    referring_urls: { type: "array", items: string },
    sitemaps: { type: "array", items: string },
    rich_results_summary: ref("PageIndexingRichResults"),
    inspection_result_link: nullable,
    inspection_error: nullable,
    inspection_failed_at: date,
    group: {
      ...pageIndexingToolSchemas.listPageIndexingUrls.properties.group,
      ...openEnum("PageIndexingGroupKind"),
    },
  }),
  PageIndexingHistory: object({
    complete: { type: "boolean" },
    changes: {
      type: "array",
      items: {
        ...object({
          at: { type: "string", format: "date-time" },
          previous: ref("PageIndexingTrackedState"),
          next: ref("PageIndexingTrackedState"),
        }),
        ...sdkName("PageIndexingChange"),
      },
    },
  }),
  PageIndexingUrls: object({
    data: { type: "array", items: ref("PageIndexingUrl") },
    meta: { ...object({ next_cursor: nullable }), ...sdkName("PageIndexingUrlsMeta") },
  }),
};
// History is present only when explicitly requested.
Object.assign(pageIndexingSchemas.PageIndexingUrl.properties, {
  history: ref("PageIndexingHistory"),
});

export const projectDefaultsInspectionBudgetModeSchema = {
  ...budget.budget_mode,
  ...openEnum("ProjectDefaultsInspectionBudgetMode"),
  readOnly: true,
  description:
    "Stored background inspection mode; available_quota is offered on self-host only. Use Page indexing settings to change it.",
};
