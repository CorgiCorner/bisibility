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
const saved = {
  type: "object",
  ...sdkName("SavedSiteAudit"),
  properties: {
    id: publicIdSchema("agr"),
    created_at: date,
    cached: { type: "boolean" },
    result: wireResult(z.toJSONSchema(siteAuditResultSchema)),
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
  properties: { max_pages: { type: "integer", minimum: 1, maximum: 15, default: 10 } },
};
export function siteAuditResponse(operationId: string) {
  return {
    type: "object",
    ...sdkName(operationId === "listSiteAudits" ? "SiteAuditListResponse" : "SiteAuditResponse"),
    properties: {
      data: operationId === "listSiteAudits" ? { type: "array", items: summary } : saved,
    },
    required: ["data"],
  };
}
