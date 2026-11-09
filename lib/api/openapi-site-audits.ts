import { siteAuditResultSchema } from "@/lib/site-audit/schema";
import { z } from "zod";
import { publicIdSchema } from "./openapi-public-id";
import { openEnum, sdkName } from "./openapi-sdk-schema";

const snake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const typeNames: Record<string, string> = {
  "": "SiteAuditResult",
  limits: "SiteAuditLimits",
  pages: "SiteAuditPage",
  "pages.headings": "SiteAuditHeading",
  "pages.issues": "SiteAuditIssue",
  "pages.issues.severity": "SiteAuditSeverity",
  state: "SiteAuditState",
  stopReason: "SiteAuditStopReason",
  summary: "SiteAuditSummary",
};

/** The result serializer snakeizes keys; derive the complete bounded shape from its validator. */
function wireResult(schema: Record<string, unknown>, path = ""): Record<string, unknown> {
  const { properties, required, items, $schema: _dialect, ...rest } = schema;
  const result = { ...rest };
  if (properties) {
    result.properties = Object.fromEntries(
      Object.entries(properties as Record<string, Record<string, unknown>>).map(([key, child]) => [
        snake(key),
        wireResult(child, path ? `${path}.${key}` : key),
      ]),
    );
    result.required = (required as string[]).map(snake);
  }
  if (items) result.items = wireResult(items as Record<string, unknown>, path);
  const name = typeNames[path];
  if (properties) Object.assign(result, sdkName(name));
  if (Array.isArray(rest.enum)) Object.assign(result, openEnum(name));
  return result;
}
const text = { type: "string" };
const date = { type: "string", format: "date-time" };
const nullableDate = { anyOf: [date, { type: "null" }] };
const progress = {
  type: "object",
  ...sdkName("SiteAuditRunProgress"),
  properties: {
    state: {
      type: "string",
      enum: ["queued", "running", "paused", "complete", "stopped", "failed", "cancelled"],
      ...openEnum("SiteAuditRunState"),
    },
    stop_reason: { anyOf: [{ type: "string" }, { type: "null" }] },
    pages_crawled: { type: "integer", minimum: 0 },
    budget_pages: { type: "integer", minimum: 0 },
    requests: { type: "integer", minimum: 0 },
    started_at: nullableDate,
    completed_at: nullableDate,
  },
  required: [
    "state",
    "stop_reason",
    "pages_crawled",
    "budget_pages",
    "requests",
    "started_at",
    "completed_at",
  ],
};
const saved = {
  type: "object",
  ...sdkName("SavedSiteAudit"),
  properties: {
    id: publicIdSchema("agr"),
    created_at: date,
    cached: { type: "boolean" },
    result: wireResult(z.toJSONSchema(siteAuditResultSchema)),
    run: progress,
  },
  required: ["id", "created_at", "cached", "result"],
};
const summary = {
  type: "object",
  ...sdkName("SiteAuditReportSummary"),
  properties: { id: publicIdSchema("agr"), title: text, kind: text, created_at: date },
  required: ["id", "title", "kind", "created_at"],
};
export const siteAuditRequest = {
  type: "object",
  ...sdkName("SiteAuditInput"),
  additionalProperties: false,
  properties: {
    max_pages: {
      type: "integer",
      minimum: 1,
      maximum: 100_000,
      default: 10,
      description:
        "The server resolves the effective crawl budget. Inline audits accept at most 15 pages.",
    },
  },
};
export function siteAuditResponse(operationId: string) {
  const pages = (
    wireResult(z.toJSONSchema(siteAuditResultSchema)).properties as Record<
      string,
      Record<string, unknown>
    >
  ).pages;
  const pageList = {
    type: "object",
    ...sdkName("SiteAuditPageList"),
    properties: {
      pages: { ...pages, maxItems: 100 },
      offset: { type: "integer", minimum: 0 },
      next_offset: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
    },
    required: ["pages", "offset", "next_offset"],
  };
  const data =
    operationId === "listSiteAudits"
      ? { type: "array", items: summary }
      : operationId === "listSiteAuditPages"
        ? pageList
        : ["getSiteAuditRun", "cancelSiteAuditRun", "resumeSiteAuditRun"].includes(operationId)
          ? progress
          : saved;
  return {
    type: "object",
    ...sdkName(
      operationId === "listSiteAudits"
        ? "SiteAuditListResponse"
        : operationId === "listSiteAuditPages"
          ? "SiteAuditPagesResponse"
          : ["getSiteAuditRun", "cancelSiteAuditRun", "resumeSiteAuditRun"].includes(operationId)
            ? "SiteAuditRunResponse"
            : "SiteAuditResponse",
    ),
    properties: {
      data,
    },
    required: ["data"],
  };
}
