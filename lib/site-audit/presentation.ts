import type { SiteAuditPage, SiteAuditResult } from "./schema";

export function hasAuditContent(page: SiteAuditPage): boolean {
  return (
    page.status !== null &&
    page.status !== 429 &&
    !page.issues.some((issue) => issue.code === "non_html")
  );
}

export function auditCoverage(result: SiteAuditResult) {
  const fetched = result.pages.filter((page) => page.status !== null && page.status !== 429);
  return {
    pages: fetched.length,
    unavailable: result.pages.length - fetched.length,
    indexable: fetched.filter((page) => hasAuditContent(page) && page.indexable).length,
  };
}
