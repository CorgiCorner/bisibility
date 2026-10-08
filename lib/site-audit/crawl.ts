import { auditFailureMessage } from "./failure";
import {
  AuditRobotsDisallowedError,
  type AuditTransport,
  type CrawlBudget,
  fetchAuditPage,
  MAX_DURATION_MS,
  MAX_PAGE_BYTES,
  MAX_REQUESTS,
} from "./fetch";
import { inspectHtml } from "./html";
import { auditRobotsPolicy } from "./robots";
import type { SiteAuditPage, SiteAuditResult } from "./schema";
import { auditTarget } from "./target";

function failedPage(url: string, message: string): SiteAuditPage {
  return {
    url,
    finalUrl: url,
    status: null,
    responseTimeMs: 0,
    title: null,
    description: null,
    canonical: null,
    headings: [],
    h1Count: 0,
    indexable: false,
    robots: null,
    internalLinkCount: 0,
    externalLinkCount: 0,
    internalLinks: [],
    imageCount: 0,
    missingAltCount: 0,
    issues: [{ code: "fetch_failed", severity: "error", message }],
  };
}
export async function crawlSite(
  domain: string,
  maxPages: number,
  transport: AuditTransport = {},
): Promise<SiteAuditResult> {
  const target = auditTarget(domain);
  const now = transport.now ?? Date.now;
  const started = now();
  const budget: CrawlBudget = {
    deadline: started + MAX_DURATION_MS,
    requests: 0,
    origin: target.origin,
    signal: AbortSignal.timeout(MAX_DURATION_MS),
  };
  const limitations = [
    "HTTP crawl only; JavaScript rendering and Lighthouse are not included.",
    "Indexability uses HTTP status, meta robots and X-Robots-Tag; canonical and search-engine indexing are not verified.",
    "Only the project origin and its exact apex/www canonical redirects are crawled, without changing scheme or port. URLs with query strings are excluded; links and headings are bounded samples.",
  ];
  const robots = auditRobotsPolicy(target, budget, transport, limitations);
  budget.disallowed = robots.disallowed;
  await robots.load(target.origin);
  const queue = [target.href];
  const seen = new Set<string>();
  const pages: SiteAuditPage[] = [];
  while (
    queue.length &&
    pages.length < maxPages &&
    now() < budget.deadline &&
    budget.requests < MAX_REQUESTS
  ) {
    const next = queue.shift();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    try {
      const fetched = await fetchAuditPage(new URL(next), budget, transport);
      const { page, discovered } = inspectHtml(fetched, next);
      pages.push(page);
      seen.add(fetched.url);
      if (!robots.unavailable())
        for (const link of discovered) {
          if (!seen.has(link) && queue.length < 200) queue.push(link);
        }
    } catch (error) {
      if (error instanceof AuditRobotsDisallowedError) {
        const page = failedPage(next, error.message);
        page.finalUrl = error.url;
        page.issues = [{ code: "robots_disallowed", severity: "info", message: error.message }];
        pages.push(page);
        continue;
      }
      pages.push(failedPage(next, auditFailureMessage(error)));
    }
  }
  const failed = new Set(
    pages.filter((page) => page.status !== null && page.status >= 400).map((page) => page.url),
  );
  for (const page of pages) {
    const count = page.internalLinks.filter((link) => failed.has(link)).length;
    if (count)
      page.issues.push({
        code: "broken_internal_link",
        severity: "warning",
        message: `${count} sampled internal links returned HTTP errors.`,
      });
  }
  const stopReason =
    now() >= budget.deadline
      ? "time_limit"
      : budget.requests >= MAX_REQUESTS
        ? "request_limit"
        : queue.length
          ? "page_limit"
          : "finished";
  return {
    version: 1,
    target: target.href,
    startedAt: new Date(started).toISOString(),
    completedAt: new Date(now()).toISOString(),
    state:
      stopReason === "finished" &&
      !robots.unavailable() &&
      pages.every((page) => page.status !== null || page.issues[0]?.code === "robots_disallowed")
        ? "complete"
        : "partial",
    stopReason,
    limits: {
      maxPages,
      maxRequests: MAX_REQUESTS,
      maxDurationMs: MAX_DURATION_MS,
      maxPageBytes: MAX_PAGE_BYTES,
    },
    requests: budget.requests,
    pages,
    summary: {
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
    limitations,
  };
}
