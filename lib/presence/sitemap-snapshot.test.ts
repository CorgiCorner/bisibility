import type { GscSitemapStatus } from "@/lib/providers/analytics/gsc-sitemaps";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { beforeEach, expect, it, vi } from "vitest";
import { persistSitemapSnapshot } from "./sitemap-snapshot";

const state = { defaults: vi.fn(), remove: vi.fn(), insert: vi.fn(), metadata: vi.fn() };
const tx = {
  projectDefaults: { findUnique: state.defaults, upsert: state.metadata },
  pageIndexingSitemap: { deleteMany: state.remove, createMany: state.insert },
};
const row: GscSitemapStatus = {
  path: "https://example.com/pages.xml",
  type: "sitemap",
  contents: [{ type: "web", submitted: 123 }],
  isSitemapsIndex: false,
  errors: 2,
  warnings: 3,
  isPending: true,
  lastSubmitted: "2026-10-23T12:00:00Z",
  lastDownloaded: null,
};
const input = {
  projectId: "p",
  property: "sc-domain:example.com",
  now: new Date("2026-10-24T12:00:00Z"),
  sitemaps: [row],
  listError: undefined,
  discovery: {
    complete: true,
    urls: new Map<string, string>(),
    parents: new Map([[row.path, "https://example.com/sitemap.xml"]]),
    childCounts: new Map([[row.path, 4]]),
  },
};
beforeEach(() => vi.resetAllMocks());
const write = (data: Parameters<typeof persistSitemapSnapshot>[1]) =>
  persistSitemapSnapshot(tx as never, data);
it("replaces even an empty snapshot and stores provider fields and parsed hierarchy", async () => {
  await write(input);
  expect(state.remove).toHaveBeenCalledWith({ where: { projectId: "p" } });
  expect(state.insert).toHaveBeenCalledWith({
    data: [
      expect.objectContaining({
        path: row.path,
        parentPath: "https://example.com/sitemap.xml",
        childCount: 4,
        submitted: 123,
        errors: 2,
        warnings: 3,
        isPending: true,
        lastDownloaded: null,
        readAt: input.now,
      }),
    ],
  });
  await write({ ...input, sitemaps: [] });
  expect(state.remove).toHaveBeenCalledTimes(2);
  expect(state.insert).toHaveBeenLastCalledWith({ data: [] });
  expect(state.metadata).toHaveBeenLastCalledWith(
    expect.objectContaining({
      update: expect.objectContaining({
        indexingSitemapReadAt: input.now,
        indexingSitemapLastError: null,
        indexingSitemapLastErrorAt: null,
      }),
    }),
  );
});
it.each([
  [new ProviderAuthError("gsc"), "permission"],
  [{ status: 403 }, "permission"],
  [new Error("timeout"), "unavailable"],
])("keeps the previous rows and successful read time after %s", async (listError, expected) => {
  await write(input);
  state.remove.mockClear();
  state.insert.mockClear();
  await write({ ...input, sitemaps: null, listError });
  expect(state.remove).not.toHaveBeenCalled();
  expect(state.insert).not.toHaveBeenCalled();
  const update = state.metadata.mock.lastCall?.[0].update;
  expect(update).toMatchObject({
    indexingSitemapLastError: expected,
    indexingSitemapLastErrorAt: input.now,
  });
  expect(update).not.toHaveProperty("indexingSitemapReadAt");
});
it("does not overwrite a more recent attempt", async () => {
  state.defaults.mockResolvedValue({ indexingSitemapAttemptAt: new Date(input.now.getTime() + 1) });
  await write(input);
  expect(state.remove).not.toHaveBeenCalled();
  expect(state.metadata).not.toHaveBeenCalled();
});
