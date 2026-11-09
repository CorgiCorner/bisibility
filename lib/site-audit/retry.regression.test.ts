import { retryDb } from "@/tests/fixtures/site-audit/retry-db";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ batch: vi.fn(), fail: vi.fn(), next: vi.fn(), attempts: 0 }));
vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => ({
    crawlSiteAuditBatchActivity: async () => {
      for (let attempt = 0; attempt < 10; attempt++) {
        runtime.attempts++;
        try {
          return await runtime.batch();
        } catch (error) {
          vi.setSystemTime(Date.now() + 5000);
          if (attempt === 9) throw error;
        }
      }
    },
    failSiteAuditActivity: runtime.fail,
  }),
  continueAsNew: runtime.next,
  isCancellation: () => false,
  sleep: async () => {
    vi.setSystemTime(Date.now() + 1000);
  },
}));
vi.mock("./report-store", () => ({ saveSiteAuditSummary: vi.fn() }));

import { siteAuditCrawlWorkflow } from "@/lib/temporal/site-audit-workflows";
import { crawlSiteAuditBatch } from "./batch";
import { interruptSiteAuditRun } from "./interrupt";
import { createCrawlStore } from "./pages-store";

beforeEach(() => {
  vi.clearAllMocks();
  runtime.attempts = 0;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());
const transport = {
  resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
  fetch: async (url: URL | RequestInfo) =>
    new Response(
      String(url).endsWith("robots.txt") ? "User-agent: *\nAllow: /" : "<title>Example</title>",
      { headers: { "content-type": "text/html" } },
    ),
};
it("exhausts real claim/save retries and reaches a failed resumable state", async () => {
  const { db, row } = retryDb();
  runtime.batch.mockImplementation(() =>
    crawlSiteAuditBatch("run", {
      store: createCrawlStore(db, 0),
      budget: async () => ({ maxPages: 15, stopReason: "page_budget", priority: 0 }),
      transport,
    }),
  );
  runtime.fail.mockImplementation(async () => {
    const failed = await interruptSiteAuditRun(db, "run", "failed", 0);
    return {
      state: failed.state,
      pagesCrawled: failed.pagesCrawled,
      stopReason: failed.stopReason,
    };
  });
  await expect(siteAuditCrawlWorkflow({ runId: "run", generation: 0 })).resolves.toMatchObject({
    state: "failed",
    stopReason: "error",
  });
  expect(runtime.attempts).toBe(10);
  expect(runtime.fail).toHaveBeenCalledExactlyOnceWith({ runId: "run", generation: 0 });
  expect(runtime.next).not.toHaveBeenCalled();
  expect(row).toMatchObject({
    state: "failed",
    pagesCrawled: 0,
    leaseToken: null,
    leaseExpiresAt: null,
  });
});
it("does not release a replacement owner's lease after a failed batch", async () => {
  const { db, row } = retryDb();
  const store = createCrawlStore(db, 0);
  store.save = async () => {
    row.leaseToken = "replacement";
    row.generation++;
    throw new Error("write failed");
  };
  await expect(
    crawlSiteAuditBatch("run", {
      store,
      budget: async () => ({ maxPages: 15, stopReason: "page_budget", priority: 0 }),
      transport,
    }),
  ).rejects.toThrow("write failed");
  expect(row).toMatchObject({ state: "running", leaseToken: "replacement", generation: 1 });
});

it("releases an acquired lease when the claim read fails", async () => {
  const { db, row, run } = retryDb();
  const read = run.findUniqueOrThrow;
  vi.spyOn(run, "findUniqueOrThrow")
    .mockImplementationOnce(read)
    .mockRejectedValueOnce(new Error("claim read failed"));
  await expect(createCrawlStore(db, 0).claim("run")).rejects.toThrow("claim read failed");
  expect(row).toMatchObject({ leaseToken: null, leaseExpiresAt: null });
});
