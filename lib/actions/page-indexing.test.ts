import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  scope: vi.fn(),
  readable: vi.fn(),
  connection: vi.fn(),
  detail: vi.fn(),
  list: vi.fn(),
}));
vi.mock("./_shared", () => ({
  getActionActor: async () => ({ id: "actor" }),
  requireProjectScope: mocks.scope,
}));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.readable }));
vi.mock("@/lib/search-index/service", () => ({
  inspectSearchIndexUrls: mocks.inspect,
  connectionForProject: mocks.connection,
}));
vi.mock("@/lib/search-index/ui-storage", () => ({ storedIndexingDetail: mocks.detail }));
vi.mock("@/lib/search-index/urls", () => ({ listPageIndexingUrls: mocks.list }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { GscPropertyUrlError } from "@/lib/providers/analytics/gsc-property-membership";
import { inspectPageIndexingUrls, loadPageIndexingDetail } from "./page-indexing";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope.mockResolvedValue({ id: "internal", publicId: "prj_test" });
  mocks.readable.mockResolvedValue({ project: { id: "internal" } });
  mocks.connection.mockResolvedValue({ property: "sc-domain:example.com" });
  mocks.inspect.mockResolvedValue({ results: [{ url: "https://example.com", error: null }] });
});
describe("inspection action boundary", () => {
  it("enforces the same member write capability and calls the stage 1 service", async () => {
    await expect(
      inspectPageIndexingUrls({ projectId: "prj_test", urls: ["https://example.com"] }),
    ).resolves.toEqual([{ url: "https://example.com", status: "success" }]);
    expect(mocks.scope).toHaveBeenCalledWith({ id: "actor" }, "update", "prj_test", {
      type: "project",
    });
    expect(mocks.inspect).toHaveBeenCalledWith(
      "internal",
      { urls: ["https://example.com"] },
      "actor",
    );
  });
  it("rejects more than ten URLs before any live service call", async () => {
    await expect(
      inspectPageIndexingUrls({
        projectId: "prj_test",
        urls: Array(11).fill("https://example.com"),
      }),
    ).rejects.toThrow();
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it("does not inspect when authorization fails", async () => {
    mocks.scope.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(
      inspectPageIndexingUrls({ projectId: "prj_test", urls: ["https://example.com"] }),
    ).rejects.toThrow("Forbidden");
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it("loads the drawer exclusively from stored history", async () => {
    mocks.detail.mockResolvedValue({ url: "https://example.com", history: { changes: [] } });
    await loadPageIndexingDetail({ projectId: "prj_test", url: "https://example.com" });
    expect(mocks.detail).toHaveBeenCalledWith(
      "internal",
      "sc-domain:example.com",
      "https://example.com",
    );
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it("translates outside-property rejection without exposing transport messages", async () => {
    mocks.inspect.mockRejectedValueOnce(new GscPropertyUrlError());
    await expect(
      inspectPageIndexingUrls({ projectId: "prj_test", urls: ["https://outside.test"] }),
    ).resolves.toEqual([{ url: "https://outside.test", status: "outside" }]);
  });
  it.each([
    [{ code: "inspection_daily_limit" }, "daily"],
    [{ code: "provider_rate_limited", scope: "daily" }, "daily"],
    [{ code: "provider_rate_limited", scope: "minute" }, "minute"],
    [{ code: "inspection_failed" }, "failure"],
  ])("maps documented error %s", async (error, status) => {
    mocks.inspect.mockResolvedValueOnce({ results: [{ url: "https://example.com", error }] });
    expect(
      await inspectPageIndexingUrls({ projectId: "prj_test", urls: ["https://example.com"] }),
    ).toEqual([{ url: "https://example.com", status }]);
  });
});
