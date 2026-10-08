import { describe, expect, it } from "vitest";
import { auditCoverage, hasAuditContent } from "./presentation";
import type { SiteAuditPage, SiteAuditResult } from "./schema";

const page = { status: 200, indexable: true, issues: [] } as unknown as SiteAuditPage;
describe("audit measurement coverage", () => {
  it("does not count legacy placeholder values as measurements", () => {
    const unavailable = { ...page, status: null, indexable: false };
    const result = {
      pages: [page, unavailable],
      summary: { pages: 2, indexable: 0 },
    } as SiteAuditResult;
    expect(auditCoverage(result)).toEqual({ pages: 1, unavailable: 1, indexable: 1 });
    expect(hasAuditContent(unavailable)).toBe(false);
  });
  it("keeps measured noindex distinct from unavailable or non-HTML content", () => {
    expect(hasAuditContent({ ...page, indexable: false })).toBe(true);
    expect(
      hasAuditContent({
        ...page,
        issues: [{ code: "non_html", severity: "info", message: "Not HTML" }],
      }),
    ).toBe(false);
  });
});
