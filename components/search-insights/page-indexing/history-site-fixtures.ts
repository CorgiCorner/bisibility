import type { IndexingDay, IndexingUrl, SitemapSnapshot } from "@/lib/search-index/ui-model";
import { drawerDropped } from "./history-drawer-fixtures";
import { snapshot } from "./history-fixtures";
import { indexingUrl } from "./indexing.test-support";

export const reviewedReasons = [
  ["Submitted and indexed", 584],
  ["Indexed, not submitted in sitemap", 28],
  ["Discovered - currently not indexed", 140],
  ["Crawled - currently not indexed", 61],
  ["Duplicate, Google chose different canonical than user", 18],
  ["Page with redirect", 12],
  ["Not found (404)", 11],
  ["Server error (5xx)", 6],
] as const;

// Deterministic allocation with exact sums and no negative remainder.
function allocate(total: number, weights: readonly number[]) {
  const sum = weights.reduce((sum, value) => sum + value, 0);
  if (!sum) return weights.map(() => 0);
  const counts = weights.map((weight) => Math.floor((total * weight) / sum));
  const remainder = total - counts.reduce((sum, value) => sum + value, 0);
  const order = weights
    .map((weight, index) => ({ index, fraction: (total * weight) / sum - counts[index] }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let index = 0; index < remainder; index++) counts[order[index].index]++;
  return counts;
}

export function siteSnapshot(latest: IndexingDay): SitemapSnapshot {
  const outsideIndexed = Math.min(28, latest.indexed);
  const outsideNotIndexed = Math.min(2, latest.notIndexed);
  const indexed = latest.indexed - outsideIndexed;
  const notIndexed = latest.notIndexed - outsideNotIndexed;
  const failures = allocate(latest.failed, [0, 2, 2]);
  const negatives = allocate(notIndexed, [60, 128, 58]);
  const base = [412, 52, 120];
  const capacity = snapshot.rows
    .slice(1)
    .map((row, index) => row.submitted - negatives[index] - failures[index] - base[index]);
  const extra = indexed >= 584 ? allocate(indexed - 584, capacity) : null;
  const positives = extra
    ? base.map((value, index) => value + extra[index])
    : allocate(indexed, base);
  const children = snapshot.rows.slice(1).map((row, index) => ({
    ...row,
    lastSubmitted: "2026-07-25T06:00:00Z",
    lastDownloaded: row.isPending ? null : `${latest.date}T05:00:00Z`,
    checks: {
      indexed: positives[index],
      notIndexed: negatives[index],
      failed: failures[index],
      notChecked: row.submitted - positives[index] - negatives[index] - failures[index],
    },
  }));
  const checks = {
    indexed,
    notIndexed,
    failed: latest.failed,
    notChecked: 1240 - indexed - notIndexed - latest.failed,
  };
  return {
    ...snapshot,
    readAt: `${latest.date}T06:00:00Z`,
    rows: [
      {
        ...snapshot.rows[0],
        checks,
        lastDownloaded: `${latest.date}T05:00:00Z`,
        lastSubmitted: "2026-07-25T06:00:00Z",
      },
      ...children,
    ],
  };
}

export function siteReasons(latest: IndexingDay, snapshot: SitemapSnapshot, oldest = latest.date) {
  const indexed = [
    snapshot.rows[0].checks.indexed,
    latest.indexed - snapshot.rows[0].checks.indexed,
  ];
  const notIndexed = allocate(
    latest.notIndexed,
    reviewedReasons.slice(2).map((reason) => reason[1]),
  );
  const ageOffsets = [0, 14, 2, 5, 8, 10, 12, 14];
  return [indexed, notIndexed].map((counts, group) =>
    counts
      .map((total, index) => ({
        coverageState: reviewedReasons[index + (group ? 2 : 0)][0],
        total,
        oldestResultAt: new Date(
          Math.min(
            new Date(`${latest.date}T06:00:00Z`).getTime(),
            new Date(`${oldest}T06:00:00Z`).getTime() +
              ageOffsets[index + (group ? 2 : 0)] * 86400000,
          ),
        ),
      }))
      .filter((reason) => reason.total > 0),
  );
}

const examples = [
  ["https://example.com/pricing", 0, "/pages-sitemap.xml", "2026-10-20"],
  ["https://example.com/blog/keyword-cannibalization", 3, "/blog/sitemap.xml", "2026-10-19"],
  ["https://example.com/blog/serp-features-2026", 2, "/blog/sitemap.xml", null],
  ["https://example.com/docs/rank-tracking?ref=nav", 4, "/docs/sitemap.xml", "2026-10-12"],
  ["https://example.com/docs/search-console", 0, "/docs/sitemap.xml", "2026-10-22"],
  ["https://example.com/compare/rank-trackers", 1, null, "2026-10-18"],
  ["https://example.com/features/old-reports", 6, "/pages-sitemap.xml", "2026-10-21"],
  ["http://example.com/", 5, null, "2026-10-22"],
] as const;

export function siteUrls(
  latest: IndexingDay,
  reasons: { coverageState: string; oldestResultAt: Date }[],
): IndexingUrl[] {
  return examples.map(([url, reason, sitemap, crawl], index) => {
    // The first run prioritizes keyword targets; later runs fill the sitemap URLs.
    const unchecked = latest.checked < 100 && index !== 5 && index !== 7;
    const isIndexed = reason < 2 || (index === 1 && latest.date < "2026-10-20");
    const group = unchecked ? "not_checked" : isIndexed ? "indexed" : "not_indexed";
    const through = new Date(`${latest.date}T06:00:00Z`);
    const coverageState = reviewedReasons[isIndexed && reason === 3 ? 0 : reason][0];
    const oldest = reasons.find((reason) => reason.coverageState === coverageState)?.oldestResultAt;
    const checkedAt = new Date(
      Math.max(
        oldest?.getTime() ?? through.getTime(),
        through.getTime() - [2, 0, 13, 10, 0, 0, 1, 0][index] * 86400000,
        crawl ? new Date(`${crawl > latest.date ? latest.date : crawl}T06:00:00Z`).getTime() : 0,
      ),
    );
    const googleCanonical = index === 3 ? "https://example.com/docs/rank-tracking" : url;
    const detail: IndexingUrl = {
      ...indexingUrl,
      url,
      group,
      source: sitemap ? "sitemap" : "keyword_target",
      sitemapUrl: sitemap ? `https://example.com${sitemap}` : null,
      sitemaps: sitemap ? [`https://example.com${sitemap}`] : [],
      verdict: unchecked ? null : isIndexed ? "PASS" : "NEUTRAL",
      coverageState: unchecked ? null : coverageState,
      googleCanonical: unchecked ? null : googleCanonical,
      userCanonical: unchecked ? null : url,
      canonicalOk: !unchecked && googleCanonical === url,
      checkedAt: unchecked ? null : checkedAt,
      createdAt: new Date("2026-07-26T06:00:00Z"),
      updatedAt: through,
      lastCrawlAt:
        !unchecked && crawl
          ? new Date(`${crawl > latest.date ? latest.date : crawl}T05:00:00Z`)
          : null,
      pageFetchState: unchecked || reason === 2 ? null : reason === 6 ? "NOT_FOUND" : "SUCCESSFUL",
      historyThrough: latest.date,
      history: { complete: true, changes: [] },
    };
    if (!unchecked)
      detail.history = {
        complete: true,
        changes:
          index === 1 && latest.date >= "2026-10-20"
            ? (drawerDropped.history?.changes ?? [])
            : [
                {
                  at: checkedAt,
                  previous: {},
                  next: { verdict: detail.verdict, coverageState: detail.coverageState },
                },
              ],
      };
    return detail;
  });
}
