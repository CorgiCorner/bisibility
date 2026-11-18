import { beforeEach, expect, it, vi } from "vitest";
import { baselinePageMembership } from "./snapshot";

const mocks = vi.hoisted(() => ({ read: vi.fn(), query: vi.fn(), pages: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./sitemap-read", () => ({ getStoredSitemapRead: mocks.read }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $queryRaw: mocks.query, projectPage: { findMany: mocks.pages } },
}));
vi.mock("@/lib/signals/emit", () => ({ emitSignal: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ fetchedAt: new Date(), paths: [], checked: true, complete: true });
  mocks.query.mockResolvedValue([]);
  mocks.pages.mockResolvedValue([{ id: "known" }, { id: "unknown" }]);
});
it.each(["partial", "late"])("uses every registry page for a %s baseline", async (kind) => {
  if (kind === "partial")
    mocks.read.mockResolvedValue({
      fetchedAt: new Date(),
      paths: ["/known"],
      checked: true,
      complete: false,
    });
  else
    mocks.query.mockResolvedValue([
      { id: "known", listed: true },
      { id: "unknown", listed: null },
    ]);
  expect(await baselinePageMembership("p1")).toEqual({
    ids: ["known", "unknown"],
    source: "registry",
  });
  expect(mocks.pages).toHaveBeenCalledWith({ where: { projectId: "p1" }, select: { id: true } });
});
it.each([
  { rows: [] },
  {
    rows: [
      { id: "known", listed: true },
      { id: "absent", listed: false },
    ],
  },
])("keeps a complete sitemap baseline: %j", async ({ rows }) => {
  mocks.query.mockResolvedValue(rows);
  expect(await baselinePageMembership("p1")).toEqual({
    ids: rows.filter((row) => row.listed).map((row) => row.id),
    source: "sitemap",
  });
  expect(mocks.pages).not.toHaveBeenCalled();
});
