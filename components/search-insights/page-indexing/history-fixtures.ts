import type { IndexingDay, SitemapSnapshot, SitemapSnapshotRow } from "@/lib/search-index/ui-model";

const dates = (first: string, count: number) =>
  Array.from({ length: count }, (_, index) =>
    new Date(new Date(`${first}T00:00:00Z`).getTime() + index * 86400000)
      .toISOString()
      .slice(0, 10),
  );
function changes(date: string): IndexingDay["changes"] {
  return date === "2026-10-20"
    ? {
        count: 1,
        entries: [
          {
            url: "https://example.com/blog/keyword-cannibalization",
            previous: "Submitted and indexed",
            next: "Crawled - currently not indexed",
          },
        ],
      }
    : { count: 0, entries: [] };
}
const day = (
  date: string,
  indexed: number,
  notIndexed: number,
  total: number,
  inspectedThatDay: number,
  stop: IndexingDay["stop"] = null,
): IndexingDay => ({
  date,
  indexed,
  notIndexed,
  total,
  checked: indexed + notIndexed,
  failed: 0,
  inspectedThatDay,
  stop,
  changes: changes(date),
});
export const firstDays = [day("2026-10-24", 18, 6, 1270, 24)];
export const thirdDays = dates("2026-10-22", 3).map((date, index) =>
  day(date, 18 + index * 26, 6 + index * 8, 1270, index ? 34 : 24),
);
// 400 calls per run include refreshes; unique coverage reaches 1,388 URLs.
export const fillingDays = dates("2026-10-10", 14).map((date, index) => {
  const checked = Math.round(100 + (1288 * index) / 13);
  const notIndexed = Math.round(checked * 0.25);
  return day(date, checked - notIndexed, notIndexed, 5000, 400, index % 5 === 0 ? null : "quota");
});
// At 50/day this 1,270-URL site needs 26 days to reach full coverage.
export const steadyDays = dates("2026-07-26", 90).map((date, index) => {
  const attempted = Math.min(1270, (index + 1) * 50);
  const failed = Math.min(4, Math.floor(attempted / 200));
  const checked = attempted - failed;
  const variation = [0, 2, -1, 1, -2, 0, 1][index % 7];
  const notIndexed =
    index < 25
      ? Math.round(checked * (248 / 1266))
      : date >= "2026-10-19"
        ? date >= "2026-10-20"
          ? 248
          : 247
        : 248 + variation;
  return {
    ...day(date, checked - notIndexed, notIndexed, 1270, 50),
    checked: attempted,
    failed,
  };
});
export const pausedDays = steadyDays.slice(-30).map((day) => {
  const off = day.date >= "2026-10-05" && day.date <= "2026-10-09";
  const previous = steadyDays.find((day) => day.date === "2026-10-04");
  return {
    ...(off && previous ? previous : day),
    date: day.date,
    inspectedThatDay: off ? 0 : 50,
    stop: off ? ("off" as const) : null,
  };
});
export const longDays = dates("2026-06-26", 120).map((date, index) => ({
  ...steadyDays[Math.min(index, steadyDays.length - 1)],
  date,
  changes: changes(date),
}));
// First run checks 14 keyword targets; subsequent runs check 50 never-inspected URLs.
export const siteFillingDays = dates("2026-10-06", 18).map((date, index) => {
  const attempted = 14 + 50 * index;
  const failed = Math.floor((4 * index) / 17);
  const checked = attempted - failed;
  const notIndexed = Math.round((checked * 248) / 860);
  return {
    ...day(date, checked - notIndexed, notIndexed, 1270, index ? 50 : 14, index ? "quota" : null),
    checked: attempted,
    failed,
  };
});

function sitemap(
  path: string,
  submitted: number,
  indexed: number,
  notIndexed: number,
  failed = 0,
): SitemapSnapshotRow {
  return {
    path,
    submitted,
    checks: { indexed, notIndexed, failed, notChecked: submitted - indexed - notIndexed - failed },
    parentPath: "/sitemap.xml",
    isIndex: false,
    childCount: 0,
    contentType: "web",
    isPending: false,
    errors: 0,
    warnings: 0,
    lastSubmitted: "2026-10-21T08:00:00Z",
    lastDownloaded: "2026-10-22T08:00:00Z",
    noLongerSubmitted: false,
  };
}
export const sitemapChildren = [
  sitemap("/pages-sitemap.xml", 512, 412, 60),
  { ...sitemap("/blog/sitemap.xml", 410, 52, 128), isPending: true, lastDownloaded: null },
  { ...sitemap("/docs/sitemap.xml", 318, 120, 58), warnings: 2 },
];
export const sitemapIndex: SitemapSnapshotRow = {
  ...sitemap("/sitemap.xml", 1240, 584, 246),
  parentPath: null,
  isIndex: true,
  childCount: 3,
  warnings: 2,
};
export const snapshot: SitemapSnapshot = {
  readAt: "2026-10-23T06:00:00Z",
  lastError: null,
  lastErrorAt: null,
  rows: [sitemapIndex, ...sitemapChildren],
};
export const singleSnapshot: SitemapSnapshot = {
  ...snapshot,
  rows: [{ ...sitemapChildren[0], parentPath: null }],
};
