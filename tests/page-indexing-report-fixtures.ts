import type { UrlPresence } from "@/lib/generated/prisma/client";

export const reportNow = new Date("2026-11-01T12:00:00Z");
const earlier = new Date("2026-10-31T12:00:00Z");
type ReportRow = Pick<
  UrlPresence,
  | "projectId"
  | "url"
  | "source"
  | "checkedAt"
  | "verdict"
  | "inspectionError"
  | "coverageState"
  | "lastListedAt"
  | "sitemapUrl"
>;

export function reportRow(path: string, overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    projectId: "project",
    url: `https://example.com/docs/${path}`,
    source: "sitemap",
    checkedAt: reportNow,
    verdict: "PASS",
    inspectionError: null,
    coverageState: "Indexed",
    lastListedAt: reportNow,
    sitemapUrl: null,
    ...overrides,
  };
}

export function reportFixture() {
  return {
    defaults: {
      indexingDiscoveryAt: reportNow as Date | null,
      indexingDiscoveryComplete: true,
    },
    settings: {
      property: "https://example.com/docs/",
      budgetMode: "fixed",
      inspectionDailyLimit: 3,
      todayCount: 2,
      last429Kind: null as string | null,
      nextResetAt: new Date("2026-11-02T08:00:00Z"),
    },
    targets: [
      { targetUrl: " https://EXAMPLE.com/docs/keyword " },
      { targetUrl: "https://example.com/docs/unchecked-target" },
      { targetUrl: "invalid" },
      { targetUrl: null },
    ],
    rows: [
      reportRow("keyword", { source: "keyword_target", checkedAt: earlier, lastListedAt: null }),
      reportRow("unchecked-target", {
        source: "keyword_target",
        checkedAt: null,
        lastListedAt: null,
      }),
      reportRow("z", { coverageState: "Z indexed" }),
      reportRow("a", { coverageState: "A indexed", checkedAt: earlier }),
      reportRow("unspecified", { coverageState: null }),
      reportRow("empty-reason", { coverageState: "" }),
      reportRow("not-indexed", { verdict: "NEUTRAL", coverageState: "Discovered" }),
      reportRow("null-verdict", { verdict: null, coverageState: null }),
      reportRow("stale-failure", { inspectionError: "", checkedAt: earlier }),
      reportRow("unchecked-failure", { inspectionError: "timeout", checkedAt: null }),
      reportRow("unchecked", { checkedAt: null }),
      reportRow("manual-listed", {
        source: "manual",
        sitemapUrl: "https://example.com/sitemap.xml",
      }),
      reportRow("manual-only", { source: "manual", lastListedAt: null, checkedAt: earlier }),
      reportRow("removed-target", { source: "keyword_target", lastListedAt: null }),
      reportRow("retired", { lastListedAt: earlier }),
      reportRow("other-project", { projectId: "other-project" }),
      reportRow("outside", { url: "https://example.org/docs/outside" }),
      reportRow("outside-prefix", { url: "https://example.com/outside" }),
      reportRow("lookalike", { url: "https://example.com.example.org/docs/outside" }),
      reportRow("invalid-url", { url: "ftp://example.com/docs/outside" }),
    ],
  };
}

export function reportGoldenFixtures() {
  const mixed = reportFixture();
  const empty = reportFixture();
  empty.defaults.indexingDiscoveryAt = null;
  empty.defaults.indexingDiscoveryComplete = false;
  empty.targets = [];
  const keywords = reportFixture();
  keywords.defaults.indexingDiscoveryAt = null;
  keywords.defaults.indexingDiscoveryComplete = false;
  const incomplete = reportFixture();
  incomplete.defaults.indexingDiscoveryComplete = false;
  incomplete.settings.last429Kind = "daily";
  const domain = reportFixture();
  domain.settings.property = "sc-domain:example.com";
  domain.rows.push(
    reportRow("subdomain", { url: "http://sub.example.com/page" }),
    reportRow("other-host", { url: "https://example.org/page" }),
  );
  return { mixed, empty, keywords, incomplete, domain };
}

// Apply the candidate predicate and projection instead of returning prefiltered mock rows.
export function matchesReportWhere(row: object, where: Record<string, unknown>): boolean {
  const values = row as Record<string, unknown>;
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR")
      return (value as Record<string, unknown>[]).some((part) => matchesReportWhere(row, part));
    if (value instanceof Date) return (values[key] as Date)?.getTime() === value.getTime();
    if (value && typeof value === "object") {
      const filter = value as { in?: unknown[]; not?: unknown };
      if (filter.in) return filter.in.includes(values[key]);
      if ("not" in filter) return values[key] !== filter.not;
    }
    return values[key] === value;
  });
}
