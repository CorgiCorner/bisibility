import { z } from "zod";

export const siteAuditSchema = z
  .object({
    maxPages: z.number().int().min(1).max(15).default(10),
  })
  .strict();
export const siteAuditActionSchema = siteAuditSchema.extend({
  projectId: z.string().trim().min(1).max(120),
});
export type SiteAuditInput = z.input<typeof siteAuditSchema>;
export type SiteAuditIssue = {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
};
export type SiteAuditPage = {
  url: string;
  finalUrl: string;
  status: number | null;
  responseTimeMs: number;
  title: string | null;
  description: string | null;
  canonical: string | null;
  headings: { level: number; text: string }[];
  h1Count: number;
  indexable: boolean;
  robots: string | null;
  internalLinkCount: number;
  externalLinkCount: number;
  internalLinks: string[];
  imageCount: number;
  missingAltCount: number;
  issues: SiteAuditIssue[];
};
export type SiteAuditResult = {
  version: 1;
  target: string;
  startedAt: string;
  completedAt: string;
  state: "complete" | "partial";
  stopReason: "finished" | "page_limit" | "time_limit" | "request_limit";
  limits: { maxPages: number; maxRequests: number; maxDurationMs: number; maxPageBytes: number };
  requests: number;
  pages: SiteAuditPage[];
  summary: { pages: number; errors: number; warnings: number; indexable: number };
  limitations: string[];
};
export type SavedSiteAudit = {
  id: string;
  createdAt: string;
  cached: boolean;
  result: SiteAuditResult;
};

const pageSchema = z.object({
  url: z.string().max(1024),
  finalUrl: z.string().max(1024),
  status: z.number().int().min(100).max(599).nullable(),
  responseTimeMs: z.number().nonnegative(),
  title: z.string().max(400).nullable(),
  description: z.string().max(400).nullable(),
  canonical: z.string().max(1024).nullable(),
  headings: z
    .array(z.object({ level: z.number().int().min(1).max(6), text: z.string().max(160) }))
    .max(10),
  h1Count: z.number().int().nonnegative(),
  indexable: z.boolean(),
  robots: z.string().max(400).nullable(),
  internalLinkCount: z.number().int().nonnegative(),
  externalLinkCount: z.number().int().nonnegative(),
  internalLinks: z.array(z.string().max(1024)).max(10),
  imageCount: z.number().int().nonnegative(),
  missingAltCount: z.number().int().nonnegative(),
  issues: z
    .array(
      z.object({
        code: z.string().max(64),
        severity: z.enum(["error", "warning", "info"]),
        message: z.string().max(400),
      }),
    )
    .max(20),
});
export const siteAuditResultSchema = z.object({
  version: z.literal(1),
  target: z.string().max(1024),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  state: z.enum(["complete", "partial"]),
  stopReason: z.enum(["finished", "page_limit", "time_limit", "request_limit"]),
  limits: z.object({
    maxPages: z.number().int().min(1).max(15),
    maxRequests: z.literal(20),
    maxDurationMs: z.literal(15000),
    maxPageBytes: z.literal(524288),
  }),
  requests: z.number().int().min(0).max(20),
  pages: z.array(pageSchema).max(15),
  summary: z.object({
    pages: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    indexable: z.number().int().nonnegative(),
  }),
  limitations: z.array(z.string().max(500)).max(10),
});
