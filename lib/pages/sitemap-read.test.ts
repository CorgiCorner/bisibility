import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getStoredSitemapRead } from "./sitemap-read";
import { normalizeStoredSitemapReads, sitemapMembershipForPage } from "./sitemap-read-model";

const mocks = vi.hoisted(() => ({ project: vi.fn(), snapshots: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: mocks.snapshots,
    project: { findFirst: mocks.project },
    sitemapSnapshot: { findMany: mocks.snapshots },
  },
}));
const now = new Date("2026-11-13T00:00:00Z");
const row = (
  date: string,
  entries = [{ loc: "https://example.com/a" }],
  sitemapUrl = "https://example.com/sitemap.xml",
) => ({ fetchedAt: new Date(date), entries, sitemapUrl, complete: true });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.snapshots.mockResolvedValue([]);
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());
it("uses the real reader, scoped to the project and newest snapshot per root", async () => {
  mocks.project.mockResolvedValue({ domain: "example.com", syncPauses: [] });
  mocks.snapshots.mockResolvedValue([
    row("2026-11-13"),
    row("2026-11-12", [{ loc: "https://example.com/b" }], "https://example.com/posts.xml"),
  ]);
  const read = await getStoredSitemapRead("p1");
  expect(mocks.project).toHaveBeenCalledWith({
    where: { id: "p1" },
    select: {
      domain: true,
      syncPauses: { where: { kind: "sitemap_fetch" }, select: { kind: true } },
    },
  });
  const query = mocks.snapshots.mock.calls[0]?.[0];
  expect(query.sql).toContain('DISTINCT ON ("sitemapUrl")');
  expect(query.sql).toContain('ORDER BY "sitemapUrl", "fetchedAt" DESC, id ASC');
  expect(query.values).toEqual(["p1", new Date("2026-08-15")]);
  expect(read).toMatchObject({
    paths: ["/a", "/b"],
    fetchedAt: new Date("2026-11-12"),
    checked: true,
    complete: true,
  });
});
it.each([
  ["unread", [], true, "/a", null],
  ["disabled", [row("2026-11-13")], false, "/a", null],
  ["stale", [row("2026-11-10")], true, "/a", null],
  ["positive", [row("2026-11-13")], true, "/a", true],
  ["negative", [row("2026-11-13")], true, "/b", false],
  ["empty successful", [row("2026-11-13", [])], true, "/a", false],
  ["partial", [{ ...row("2026-11-13", []), urlCount: 5 }], true, "/a", null],
] as const)("transition: %s", (_name, rows, enabled, path, expected) => {
  const read = normalizeStoredSitemapReads(rows, "example.com", enabled, now);
  expect(sitemapMembershipForPage(read, "example.com", path, new Date("2026-11-01"))).toBe(
    expected,
  );
});
it("rejects a late page, keeps equality checked, and is independent of read order", () => {
  const rows = [row("2026-11-12"), row("2026-11-11", [], "https://example.com/posts.xml")];
  const read = normalizeStoredSitemapReads(rows, "example.com", true, now);
  expect(sitemapMembershipForPage(read, "example.com", "/b", new Date("2026-11-12"))).toBeNull();
  expect(sitemapMembershipForPage(read, "example.com", "/b", new Date("2026-11-11"))).toBe(false);
  expect(normalizeStoredSitemapReads([...rows].reverse(), "example.com", true, now)).toEqual(read);
});

it("requires the configured root even if only an auxiliary root is retained", async () => {
  mocks.project.mockResolvedValue({ domain: "example.com", syncPauses: [] });
  mocks.snapshots.mockResolvedValue([row("2026-11-13", [], "https://example.com/aux.xml")]);
  const read = await getStoredSitemapRead("p1");
  expect(read).toMatchObject({ checked: true, complete: false });
  expect(sitemapMembershipForPage(read, "example.com", "/b", new Date("2026-01-01"))).toBeNull();
});
it("treats explicitly incomplete reads as unknown even when their observed count matches", () => {
  const read = normalizeStoredSitemapReads(
    [{ ...row("2026-11-13", []), complete: false, urlCount: 0 }],
    "example.com",
    true,
    now,
  );
  expect(sitemapMembershipForPage(read, "example.com", "/b", new Date("2026-01-01"))).toBeNull();
});

it("canonicalizes the configured root from the same tracked domain used for membership", async () => {
  mocks.project.mockResolvedValue({
    domain: "https://www.example.com/",
    syncPauses: [],
  });
  mocks.snapshots.mockResolvedValue([row("2026-11-13", [], "https://www.example.com/sitemap.xml")]);
  const read = await getStoredSitemapRead("p1");
  expect(read?.complete).toBe(true);
  expect(
    sitemapMembershipForPage(
      read,
      "https://www.example.com/",
      "https://example.com/a",
      new Date("2026-01-01"),
    ),
  ).toBe(false);
});
