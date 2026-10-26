import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), list: vi.fn(), discover: vi.fn() }));
vi.mock("./service", () => ({
  connectionForProject: mocks.connection,
  listSearchIndexSitemaps: mocks.list,
}));
vi.mock("@/lib/presence/candidates", () => ({ refreshInspectionCandidates: mocks.discover }));

import { readProjectSitemaps } from "./read-sitemaps";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connection.mockResolvedValue({ property: "sc-domain:example.com" });
  mocks.list.mockResolvedValue({ property: "sc-domain:example.com", sitemaps: [] });
  mocks.discover.mockImplementation(
    async ({ listSitemaps }: { listSitemaps: () => Promise<unknown> }) => {
      try {
        await listSitemaps();
      } catch {
        /* Discovery retains the previous snapshot on listing errors. */
      }
    },
  );
});
it("uses bounded sitemap discovery and accepts a successful empty list", async () => {
  const before = Date.now();
  await readProjectSitemaps("internal");
  const input = mocks.discover.mock.calls[0][0];
  expect(input).toMatchObject({ projectId: "internal", property: "sc-domain:example.com" });
  expect(input.runDeadline).toBeGreaterThanOrEqual(before + 15_000);
  expect(input.runDeadline).toBeLessThanOrEqual(Date.now() + 15_000);
  expect(mocks.list).toHaveBeenCalledWith("internal");
});
it.each([new Error("unavailable"), undefined])(
  "does not treat failed listing as an empty success",
  async (failure) => {
    mocks.list.mockRejectedValueOnce(failure);
    await expect(readProjectSitemaps("internal")).rejects.toThrow("Sitemaps could not be read");
  },
);
it("does not persist a listing from a property changed during the read", async () => {
  mocks.list.mockResolvedValueOnce({ property: "sc-domain:example.org", sitemaps: [] });
  await expect(readProjectSitemaps("internal")).rejects.toThrow("Sitemaps could not be read");
});
