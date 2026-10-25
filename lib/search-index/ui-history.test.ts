import { beforeEach, expect, it, vi } from "vitest";
import { storedIndexingDays, storedSitemapSnapshot } from "./ui-history";

const state = vi.hoisted(() => ({
  defaults: vi.fn(),
  days: vi.fn(),
  sitemaps: vi.fn(),
  inspections: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        projectDefaults: { findUnique: state.defaults },
        pageIndexingSitemap: { findMany: state.sitemaps },
        urlPresence: { findMany: state.inspections },
      }),
    projectDefaults: { findUnique: state.defaults },
    pageIndexingDay: { findMany: state.days },
    pageIndexingSitemap: { findMany: state.sitemaps },
    urlPresence: { findMany: state.inspections },
  },
}));
const at = new Date("2026-10-24T12:00:00Z");
const property = "sc-domain:example.com";
beforeEach(() => {
  vi.resetAllMocks();
  state.defaults.mockResolvedValue({
    timezone: "Europe/Warsaw",
    indexingSitemapProperty: property,
    indexingSitemapReadAt: at,
  });
  state.sitemaps.mockResolvedValue([
    {
      id: "s",
      projectId: "p",
      path: "https://example.com/pages.xml",
      parentPath: null,
      isIndex: false,
      childCount: 0,
      contentType: "web",
      isPending: false,
      errors: 0,
      warnings: 0,
      lastSubmitted: at,
      lastDownloaded: null,
      submitted: 100,
      readAt: at,
    },
  ]);
  state.inspections.mockResolvedValue([
    {
      url: "https://example.com/a",
      sitemapUrl: "https://example.com/pages.xml",
      checkedAt: at,
      inspectionError: null,
      verdict: "PASS",
    },
    {
      url: "https://example.com/b",
      sitemapUrl: "https://example.com/pages.xml",
      checkedAt: at,
      inspectionError: null,
      verdict: "FAIL",
    },
    {
      url: "https://example.com/c",
      sitemapUrl: "https://example.com/pages.xml",
      checkedAt: at,
      inspectionError: "failed",
      verdict: "PASS",
    },
    {
      url: "https://example.com/d",
      sitemapUrl: "https://example.com/removed.xml",
      checkedAt: null,
      inspectionError: null,
      verdict: null,
    },
    {
      url: "https://outside.test/",
      sitemapUrl: "https://example.com/removed.xml",
      checkedAt: at,
      inspectionError: null,
      verdict: "PASS",
    },
  ]);
});
it("loads stored days only, ascending in the last 90 calendar dates without backfill", async () => {
  const day = {
    date: "2026-10-24",
    indexed: 1,
    notIndexed: 2,
    failed: 1,
    checked: 4,
    total: 10,
    inspectedThatDay: 2,
    stop: "quota",
    changes: { count: 0, entries: [] },
  };
  state.days.mockResolvedValue([{ ...day, id: "d", property, projectId: "p", recordedAt: at }]);
  expect(await storedIndexingDays("p", property, at)).toEqual([day]);
  expect(state.days).toHaveBeenCalledWith({
    where: { projectId: "p", property, date: { gte: "2026-07-27", lte: "2026-10-24" } },
    orderBy: { date: "asc" },
  });
});
it("maps the component snapshot shape, groups our checks and keeps absent origins", async () => {
  const snapshot = await storedSitemapSnapshot("p", property);
  expect(snapshot).toMatchObject({ readAt: at.toISOString(), lastError: null, lastErrorAt: null });
  expect(snapshot.rows[0]).toEqual({
    path: "https://example.com/pages.xml",
    parentPath: null,
    isIndex: false,
    childCount: 0,
    contentType: "web",
    isPending: false,
    errors: 0,
    warnings: 0,
    lastSubmitted: at.toISOString(),
    lastDownloaded: null,
    submitted: 100,
    noLongerSubmitted: false,
    checks: { indexed: 1, notIndexed: 1, failed: 1, notChecked: 0 },
  });
  expect(snapshot.rows[1]).toMatchObject({
    path: "https://example.com/removed.xml",
    submitted: 0,
    noLongerSubmitted: true,
    checks: { indexed: 0, notIndexed: 0, failed: 0, notChecked: 1 },
  });
});
it("retains the previous snapshot with a permission error on a failed read", async () => {
  state.defaults.mockResolvedValue({
    indexingSitemapProperty: property,
    indexingSitemapReadAt: at,
    indexingSitemapLastError: "permission",
    indexingSitemapLastErrorAt: at,
  });
  expect(await storedSitemapSnapshot("p", property)).toMatchObject({
    lastError: "permission",
    rows: expect.any(Array),
  });
});
it("does not invent removed sitemap evidence before the first successful read", async () => {
  state.defaults.mockResolvedValue({
    indexingSitemapLastError: "unavailable",
    indexingSitemapLastErrorAt: at,
  });
  expect(await storedSitemapSnapshot("p", property)).toEqual({
    readAt: null,
    lastError: "unavailable",
    lastErrorAt: at.toISOString(),
    rows: [],
  });
});
it("does not expose the previous property's snapshot", async () => {
  expect((await storedSitemapSnapshot("p", "sc-domain:another.test")).rows).toEqual([]);
  expect(state.sitemaps).not.toHaveBeenCalled();
});
