import { beforeEach, expect, it, vi } from "vitest";

vi.mock("./sitemap-snapshot", () => ({ persistSitemapSnapshot: vi.fn() }));

import { refreshInspectionCandidates } from "./candidates";
import { persistSitemapSnapshot } from "./sitemap-snapshot";

const state = vi.hoisted(() => ({
  transaction: vi.fn(),
  lock: vi.fn(),
  defaults: vi.fn(),
  listed: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  discover: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    keyword: { findMany: async () => [{ targetUrl: "https://example.com/target" }] },
    $transaction: state.transaction,
  },
}));
vi.mock("./sitemap-candidates", () => ({ discoverSitemapCandidates: state.discover }));
const now = new Date("2026-10-24T12:00:00Z");
const input = {
  projectId: "project",
  property: "https://example.com/",
  now,
  listSitemaps: async () => {
    expect(state.transaction).not.toHaveBeenCalled();
    return [];
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  let inTransaction = false;
  let locked = false;
  state.lock.mockImplementation(async () => {
    expect(inTransaction).toBe(true);
    locked = true;
  });
  for (const method of [state.defaults, state.listed, state.insert, state.update, state.upsert])
    method.mockImplementation(async () => {
      expect(inTransaction && locked).toBe(true);
      return [];
    });
  state.defaults.mockResolvedValue(null);
  state.transaction.mockImplementation(async (callback) => {
    inTransaction = true;
    try {
      return await callback({
        $executeRaw: state.lock,
        projectDefaults: { findUnique: state.defaults, upsert: state.upsert },
        urlPresence: { findMany: state.listed, createMany: state.insert, updateMany: state.update },
      });
    } finally {
      inTransaction = false;
    }
  });
  state.discover.mockResolvedValue({
    complete: false,
    urls: new Map([["https://example.com/sitemap-url", "https://example.com/sitemap.xml"]]),
  });
});
it("locks before retained reads and commits all candidate writes and discovery metadata in one transaction", async () => {
  expect(await refreshInspectionCandidates(input)).toEqual([
    "https://example.com/target",
    "https://example.com/sitemap-url",
  ]);
  expect(state.transaction).toHaveBeenCalledExactlyOnceWith(expect.any(Function), {
    timeout: 60_000,
  });
  expect(state.lock).toHaveBeenCalledWith(expect.anything(), "indexing-discovery:project");
  expect(state.listed).toHaveBeenCalledOnce();
  expect(persistSitemapSnapshot).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ projectId: "project", sitemaps: [], now }),
  );
  expect(state.insert).toHaveBeenCalledOnce();
  expect(state.update).toHaveBeenCalledTimes(5);
  expect(state.upsert).toHaveBeenCalledOnce();
});
it("returns the stored current candidates without writes for an older discovery", async () => {
  state.defaults.mockResolvedValue({ indexingDiscoveryAt: new Date(now.getTime() + 1) });
  state.listed.mockResolvedValue([{ url: "https://example.com/current" }]);
  expect(await refreshInspectionCandidates(input)).toEqual(["https://example.com/current"]);
  for (const write of [state.insert, state.update, state.upsert])
    expect(write).not.toHaveBeenCalled();
});
