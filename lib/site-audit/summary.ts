import type { CrawlStopReason } from "./run-contract";
import type { SiteAuditPage, SiteAuditResult } from "./schema";

export function auditRunSummary(input: {
  target: string;
  startedAt: Date;
  completedAt: Date;
  budgetPages: number;
  requests: number;
  stopReason: CrawlStopReason;
  pages: SiteAuditPage[];
  totals?: {
    pages: number;
    errors: number;
    warnings: number;
    indexable: number;
    unavailable: number;
  };
}): SiteAuditResult {
  const { pages } = input;
  const complete =
    input.stopReason === "finished" &&
    (input.totals
      ? input.totals.unavailable === 0
      : pages.every(
          (page) =>
            (page.status !== null && page.status !== 429) ||
            page.issues[0]?.code === "robots_disallowed",
        ));
  return {
    version: 1,
    target: input.target,
    startedAt: input.startedAt.toISOString(),
    completedAt: input.completedAt.toISOString(),
    state: complete ? "complete" : "partial",
    stopReason:
      input.stopReason === "finished"
        ? "finished"
        : input.stopReason === "page_budget" ||
            input.stopReason === "monthly_pool" ||
            input.stopReason === "unverified_cap"
          ? "page_limit"
          : "time_limit",
    limits: {
      maxPages: Math.max(1, input.budgetPages),
      maxRequests: Math.max(20, input.requests),
      maxDurationMs: 60_000,
      maxPageBytes: 524_288,
    },
    requests: input.requests,
    pages: pages.slice(0, 15),
    summary: input.totals
      ? {
          pages: input.totals.pages,
          errors: input.totals.errors,
          warnings: input.totals.warnings,
          indexable: input.totals.indexable,
        }
      : {
          pages: pages.length,
          errors: pages.reduce(
            (sum, page) => sum + page.issues.filter((issue) => issue.severity === "error").length,
            0,
          ),
          warnings: pages.reduce(
            (sum, page) => sum + page.issues.filter((issue) => issue.severity === "warning").length,
            0,
          ),
          indexable: pages.filter((page) => page.indexable).length,
        },
    limitations: [
      "HTTP crawl only; JavaScript rendering and Lighthouse are not included.",
      "Only sampled pages are included in this summary; use paginated pages for the full crawl.",
    ],
  };
}
