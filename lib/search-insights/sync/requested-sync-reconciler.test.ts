import { beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileRequestedSearchInsightsSyncs } from "./requested-sync-reconciler";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  start: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { searchAnalyticsImport: { findMany: mocks.findMany, updateMany: mocks.updateMany } },
}));
vi.mock("@/lib/temporal/search-insights-client", () => ({
  startSearchInsightsSyncWorkflow: mocks.start,
}));

const requestedAt = new Date("2026-09-03T14:00:00.000Z");
const requested = {
  id: "import_1",
  projectId: "project_1",
  syncRequestedAt: requestedAt,
};

describe("reconcileRequestedSearchInsightsSyncs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.start.mockResolvedValue({
      runId: "run_1",
      workflowId: "search-insights-sync:project_1",
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("claims before starting and consumes the request after the worker accepts it", async () => {
    mocks.findMany.mockResolvedValue([requested]);
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(reconcileRequestedSearchInsightsSyncs()).resolves.toMatchObject({
      claimed: 1,
      failed: 0,
      scanned: 1,
      started: 1,
    });

    expect(mocks.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.start.mock.invocationCallOrder[0],
    );
    expect(mocks.updateMany).toHaveBeenNthCalledWith(1, {
      data: { syncStartedAt: expect.any(Date) },
      where: {
        id: "import_1",
        state: { notIn: ["queued", "running"] },
        syncRequestedAt: requestedAt,
        syncStartedAt: null,
      },
    });
    expect(mocks.start).toHaveBeenCalledWith({ projectId: "project_1" });
    expect(mocks.updateMany).toHaveBeenNthCalledWith(2, {
      data: { syncRequestedAt: null },
      where: {
        id: "import_1",
        syncRequestedAt: requestedAt,
        syncStartedAt: expect.any(Date),
      },
    });
    expect(consoleInfo).toHaveBeenCalledWith("[search-insights] queued sync started", {
      importId: "import_1",
      projectId: "project_1",
      workflowId: "search-insights-sync:project_1",
    });
    consoleInfo.mockRestore();
  });

  it("claims a stamped sync exactly once across two concurrent worker sweeps", async () => {
    let claimedAt: Date | null = null;
    mocks.findMany.mockResolvedValue([requested]);
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.updateMany.mockImplementation(async ({ data, where }) => {
      await Promise.resolve();
      if (data.syncStartedAt) {
        if (claimedAt !== null || where.syncRequestedAt !== requestedAt) return { count: 0 };
        claimedAt = data.syncStartedAt;
        return { count: 1 };
      }
      return { count: claimedAt === where.syncStartedAt ? 1 : 0 };
    });

    const [first, second] = await Promise.all([
      reconcileRequestedSearchInsightsSyncs(),
      reconcileRequestedSearchInsightsSyncs(),
    ]);

    expect(first.claimed + second.claimed).toBe(1);
    expect(first.started + second.started).toBe(1);
    expect(mocks.start).toHaveBeenCalledOnce();
    consoleInfo.mockRestore();
  });

  it("releases the claim for a later sweep when the workflow start fails", async () => {
    mocks.findMany.mockResolvedValue([requested]);
    mocks.start.mockRejectedValue(new Error("engine unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(reconcileRequestedSearchInsightsSyncs()).resolves.toMatchObject({
      claimed: 1,
      failed: 1,
      started: 0,
    });

    expect(mocks.updateMany).toHaveBeenNthCalledWith(2, {
      data: { syncStartedAt: null },
      where: {
        id: "import_1",
        syncRequestedAt: requestedAt,
        syncStartedAt: expect.any(Date),
      },
    });
    consoleError.mockRestore();
  });
});
