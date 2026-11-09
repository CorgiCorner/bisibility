import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ batch: vi.fn(), fail: vi.fn(), next: vi.fn(), sleep: vi.fn() }));
vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => ({
    crawlSiteAuditBatchActivity: mocks.batch,
    failSiteAuditActivity: mocks.fail,
  }),
  continueAsNew: mocks.next,
  isCancellation: () => false,
  sleep: mocks.sleep,
}));

import { siteAuditCrawlWorkflow } from "./site-audit-workflows";

beforeEach(() => {
  vi.clearAllMocks();
});
describe("site audit workflow", () => {
  it("continues as new after twenty active batches", async () => {
    mocks.batch.mockResolvedValue({ state: "running", pagesCrawled: 1, stopReason: null });
    mocks.next.mockResolvedValue("continued");
    await expect(siteAuditCrawlWorkflow({ runId: "run" })).resolves.toBe("continued");
    expect(mocks.batch).toHaveBeenCalledTimes(20);
    expect(mocks.next).toHaveBeenCalledWith({ runId: "run", batches: 0 });
  });
  it.each(["complete", "stopped", "failed", "cancelled", "paused"])(
    "stops when the run is %s",
    async (state) => {
      mocks.batch.mockResolvedValue({ state, pagesCrawled: 4, stopReason: null });
      await expect(siteAuditCrawlWorkflow({ runId: "run" })).resolves.toMatchObject({ state });
      expect(mocks.next).not.toHaveBeenCalled();
    },
  );
  it("marks an exhausted activity failed so the user can resume it", async () => {
    mocks.batch.mockRejectedValue(new Error("activity exhausted"));
    mocks.fail.mockResolvedValue({ state: "failed", pagesCrawled: 4, stopReason: "error" });
    await expect(siteAuditCrawlWorkflow({ runId: "run", generation: 2 })).resolves.toMatchObject({
      state: "failed",
    });
    expect(mocks.fail).toHaveBeenCalledWith({ runId: "run", generation: 2 });
  });
});
