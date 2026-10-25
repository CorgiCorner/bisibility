import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scope: vi.fn(),
  count: vi.fn(),
  group: vi.fn(),
  find: vi.fn(),
  history: vi.fn(),
}));
vi.mock("./strip-history", () => ({ storedStripHistory: async () => [] }));
vi.mock("./current-rows", () => ({ currentPageIndexingScope: mocks.scope }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    urlPresence: { count: mocks.count, groupBy: mocks.group, findUnique: mocks.find },
    urlPresenceChange: { findMany: mocks.history },
  },
}));
vi.mock("./report", () => ({ pageIndexingGroup: () => "not_indexed" }));

import { storedIndexingDetail, storedIndexingSitemaps, storedNotIndexedCount } from "./ui-storage";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope.mockResolvedValue({
    where: { projectId: "p", url: { in: ["https://example.com/"] } },
  });
});
it("counts only checked, successful provider results outside the indexed group", async () => {
  mocks.count.mockResolvedValue(248);
  expect(await storedNotIndexedCount("p", "sc-domain:example.com")).toBe(248);
  expect(mocks.count).toHaveBeenCalledWith({
    where: {
      AND: [
        { projectId: "p", url: { in: ["https://example.com/"] } },
        {
          checkedAt: { not: null },
          inspectionError: null,
          OR: [{ verdict: { not: "PASS" } }, { verdict: null }],
        },
      ],
    },
  });
});
it("reports stored sitemap origins without inventing submitted totals", async () => {
  mocks.group.mockResolvedValue([{ sitemapUrl: "https://example.com/pages.xml", _count: 12 }]);
  expect(await storedIndexingSitemaps("p", "sc-domain:example.com")).toEqual([
    { id: "https://example.com/pages.xml", total: 12 },
  ]);
});
it("does not disclose a former property's stored detail", async () => {
  expect(
    await storedIndexingDetail("p", "https://example.com/", "https://outside.test/"),
  ).toBeNull();
  expect(mocks.find).not.toHaveBeenCalled();
});
it("reads the exact stored URL, caps history, and reports truncation", async () => {
  mocks.find.mockResolvedValue({ url: "https://example.com/", verdict: "NEUTRAL" });
  mocks.history.mockResolvedValue(
    Array.from({ length: 101 }, () => ({ at: new Date(), previous: null, next: {} })),
  );
  const result = await storedIndexingDetail("p", "sc-domain:example.com", "https://example.com/");
  expect(mocks.find).toHaveBeenCalledWith({
    where: { projectId_url: { projectId: "p", url: "https://example.com/" } },
  });
  expect(result?.history?.changes).toHaveLength(100);
  expect(result?.history?.complete).toBe(false);
});
