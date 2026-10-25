import type { IndexingData, IndexingUrl } from "@/lib/search-index/ui-model";

// Google inspection fields use documented shape, not captured provider data.
export const indexingUrl: IndexingUrl = {
  url: "https://example.com/a-very-long/path/duplicate-page",
  verdict: "NEUTRAL",
  coverageState: "Duplicate, Google chose different canonical than user",
  group: "not_indexed",
  lastCrawlAt: new Date("2026-10-22T10:00:00Z"),
  canonicalOk: false,
  checkedAt: new Date("2026-10-23T06:00:00Z"),
  source: "keyword_target",
  sitemapUrl: "https://example.com/pages.xml",
  googleCanonical: "https://example.com/canonical",
  userCanonical: "https://example.com/a-very-long/path/duplicate-page",
  indexingState: "INDEXING_ALLOWED",
  robotsTxtState: "ALLOWED",
  pageFetchState: "SUCCESSFUL",
  crawledAs: "MOBILE",
  referringUrls: ["https://example.com/"],
  sitemaps: ["https://example.com/pages.xml"],
  richResultsSummary: { verdict: "PASS", detectedItems: [] },
  inspectionResultLink:
    "https://search.google.com/search-console/inspect?resource_id=sc-domain%3Aexample.com",
  inspectionError: null,
  inspectionFailedAt: null,
  createdAt: new Date("2026-10-20T06:00:00Z"),
  updatedAt: new Date("2026-10-23T06:00:00Z"),
  history: {
    complete: true,
    changes: [
      {
        at: new Date("2026-10-20T06:00:00Z"),
        previous: { verdict: "PASS" },
        next: { verdict: "NEUTRAL" },
      },
    ],
  },
};
const freshness = {
  checked: 2,
  total: 3,
  remaining: 1,
  complete: false,
  oldestResultAt: new Date("2026-10-22T06:00:00Z"),
  newestResultAt: new Date("2026-10-23T06:00:00Z"),
};
const budget = {
  budgetMode: "fixed" as const,
  todayCount: 50,
  last429Kind: null,
  nextResetAt: new Date("2026-10-23T07:00:00Z"),
};
export const indexingData: IndexingData = {
  now: new Date("2026-10-23T06:00:00Z"),
  report: {
    ...freshness,
    ...budget,
    property: "sc-domain:example.com",
    discoveryComplete: true,
    discoveredAt: new Date("2026-10-23T06:00:00Z"),
    estimatedDaysRemaining: 1,
    groups: ["indexed", "not_indexed", "inspection_failed", "not_checked"].map((group) => ({
      ...freshness,
      ...budget,
      group: group as IndexingData["report"]["groups"][number]["group"],
      total: group === "inspection_failed" ? 0 : 1,
      reasons: [
        {
          coverageState: group === "not_indexed" ? indexingUrl.coverageState : null,
          total: 1,
          oldestResultAt: freshness.oldestResultAt,
        },
      ],
    })),
  },
  allowance: { limit: 50, used: 2, remaining: 48 },
  settings: {
    ...budget,
    property: "sc-domain:example.com",
    inspectionDailyLimit: 50,
    availableModes: ["off", "fixed"],
    last429At: null,
  },
  urls: [indexingUrl],
  nextCursor: null,
  sitemaps: [{ id: "https://example.com/pages.xml", total: 3 }],
};
