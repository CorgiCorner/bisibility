import type { IndexingUrl } from "@/lib/search-index/ui-model";
import { indexingUrl } from "./indexing.test-support";

function drawer(transitions: readonly [string, boolean][], through = "2026-10-23"): IndexingUrl {
  const latest = transitions.at(-1);
  const indexed = latest?.[1] ?? false;
  const url = "https://example.com/pages/indexing-history";
  return {
    ...indexingUrl,
    url,
    userCanonical: url,
    googleCanonical: url,
    canonicalOk: true,
    group: indexed ? "indexed" : "not_indexed",
    verdict: indexed ? "PASS" : "NEUTRAL",
    coverageState: indexed ? "Submitted and indexed" : "Crawled - currently not indexed",
    createdAt: new Date(`${transitions[0][0]}T06:00:00Z`),
    checkedAt: new Date(`${through}T06:00:00Z`),
    updatedAt: new Date(`${through}T06:00:00Z`),
    lastCrawlAt: new Date(`${through}T05:00:00Z`),
    historyThrough: through,
    source: "sitemap",
    sitemapUrl: "https://example.com/pages-sitemap.xml",
    sitemaps: ["https://example.com/pages-sitemap.xml"],
    history: {
      complete: true,
      changes: transitions
        .map(([date, value], index) => ({
          at: new Date(`${date}T06:00:00Z`),
          previous: index
            ? {
                verdict: transitions[index - 1][1] ? "PASS" : "NEUTRAL",
                coverageState: transitions[index - 1][1]
                  ? "Submitted and indexed"
                  : "Crawled - currently not indexed",
              }
            : {},
          next: {
            verdict: value ? "PASS" : "NEUTRAL",
            coverageState: value ? "Submitted and indexed" : "Crawled - currently not indexed",
          },
        }))
        .reverse(),
    },
  };
}
export const drawerToday = drawer([["2026-10-24", true]], "2026-10-24");
export const drawerSteady = drawer([["2026-09-13", true]]);
export const drawerDropped: IndexingUrl = {
  ...drawer([
    ["2026-09-02", true],
    ["2026-10-20", false],
  ]),
  url: "https://example.com/blog/keyword-cannibalization",
  googleCanonical: "https://example.com/blog/keyword-cannibalization",
  userCanonical: "https://example.com/blog/keyword-cannibalization",
  sitemapUrl: "https://example.com/blog/sitemap.xml",
  sitemaps: ["https://example.com/blog/sitemap.xml"],
  lastCrawlAt: new Date("2026-10-19T05:00:00Z"),
};
export const drawerFlapping = drawer([
  ["2026-07-26", false],
  ["2026-08-05", true],
  ["2026-09-10", false],
  ["2026-10-15", true],
]);
export const drawerFailed: IndexingUrl = {
  ...drawerSteady,
  group: "inspection_failed",
  inspectionError: "API_ERROR",
  inspectionFailedAt: new Date("2026-10-23T07:00:00Z"),
};
export const drawerManual: IndexingUrl = {
  ...drawer([["2026-10-10", true]]),
  source: "manual",
  sitemapUrl: null,
  sitemaps: [],
  checkedAt: new Date("2026-10-10T06:00:00Z"),
  updatedAt: new Date("2026-10-10T06:00:00Z"),
  lastCrawlAt: new Date("2026-10-10T05:00:00Z"),
};
