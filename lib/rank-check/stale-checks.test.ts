import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markStaleRunningChecks, STALE_RUNNING_CHECK_ERROR } from "./stale-checks";

const mocks = vi.hoisted(() => ({
  publishOperationChanged: vi.fn(() => Promise.resolve()),
  reconcileQueued: vi.fn(),
  prisma: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    auditLog: { create: vi.fn() },
    rankCheck: { findMany: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
    rankCheckRun: { update: vi.fn() },
    rankCheckRunItem: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/notifications/realtime", () => ({
  publishOperationChanged: mocks.publishOperationChanged,
}));
vi.mock("./queued-deadline-maintenance", () => ({
  reconcileExpiredQueuedRankCheckBatches: mocks.reconcileQueued,
}));

describe("markStaleRunningChecks", () => {
  beforeEach(() => {
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.prisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
    mocks.prisma.rankCheck.findUniqueOrThrow.mockResolvedValue({ costCents: null });
    mocks.prisma.rankCheckRun.update.mockResolvedValue({});
    mocks.prisma.rankCheckRunItem.findMany.mockResolvedValue([]);
    mocks.prisma.rankCheckRunItem.findUnique.mockResolvedValue(null);
    mocks.prisma.rankCheckRunItem.updateMany.mockResolvedValue({ count: 0 });
    mocks.reconcileQueued.mockResolvedValue({
      examined: 0,
      failed: 0,
      failureBatchIds: [],
      hasMore: false,
      nextCursor: null,
      pending: 0,
      terminal: 0,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("marks running checks older than the default stale window as failed", async () => {
    const now = new Date("2026-01-01T06:20:00.000Z");
    mocks.prisma.rankCheck.findMany.mockResolvedValue([
      {
        id: "rank_1",
        keyword: { projectId: "project_1", publicId: "kw_a00000000000000000000000" },
        provider: "serpapi",
        publicId: "check_a00000000000000000000000",
      },
      {
        id: "rank_2",
        keyword: { projectId: "project_1", publicId: "kw_b00000000000000000000000" },
        provider: "serpapi",
        publicId: "check_b00000000000000000000000",
      },
      {
        id: "rank_3",
        keyword: { projectId: "project_1", publicId: "kw_c00000000000000000000000" },
        provider: "serpapi",
        publicId: "check_c00000000000000000000000",
      },
    ]);
    mocks.prisma.rankCheck.updateMany.mockResolvedValue({ count: 3 });

    await expect(markStaleRunningChecks({ now })).resolves.toEqual({
      cutoff: new Date("2026-01-01T06:05:00.000Z"),
      failed: 3,
      olderThanMinutes: 15,
      queuedBatches: 0,
      queuedFailed: 0,
      queuedFailureBatchIds: [],
      queuedHasMore: false,
      queuedNextCursor: null,
      queuedPending: 0,
      queuedSweepAt: now,
      queuedTerminal: 0,
    });
    expect(mocks.prisma.rankCheck.updateMany).toHaveBeenCalledWith({
      data: {
        attemptCount: 0,
        degradedToCountry: false,
        error: STALE_RUNNING_CHECK_ERROR,
        estimatedCostCents: null,
        finishedAt: new Date("2026-01-01T06:20:00.000Z"),
        normalizationVersion: null,
        status: "failed",
        viaFallback: false,
      },
      where: { id: { in: ["rank_1", "rank_2", "rank_3"] }, status: "running" },
    });
  });

  it("leaves running checks exactly at the cutoff untouched", async () => {
    const now = new Date("2026-01-01T06:20:00.000Z");
    const cutoff = new Date("2026-01-01T06:05:00.000Z");
    mocks.prisma.rankCheck.findMany.mockResolvedValue([]);

    await expect(markStaleRunningChecks({ now })).resolves.toEqual({
      cutoff,
      failed: 0,
      olderThanMinutes: 15,
      queuedBatches: 0,
      queuedFailed: 0,
      queuedFailureBatchIds: [],
      queuedHasMore: false,
      queuedNextCursor: null,
      queuedPending: 0,
      queuedSweepAt: now,
      queuedTerminal: 0,
    });

    expect(mocks.prisma.rankCheck.findMany).toHaveBeenCalledWith({
      orderBy: { id: "asc" },
      select: {
        estimatedCostCents: true,
        id: true,
        keyword: { select: { projectId: true, publicId: true } },
        keywordId: true,
        provider: true,
        publicId: true,
      },
      take: 100,
      where: {
        checkedAt: { lt: cutoff },
        queuedTask: null,
        status: "running",
      },
    });
    expect(mocks.prisma.rankCheck.updateMany).not.toHaveBeenCalled();
    expect(mocks.reconcileQueued).toHaveBeenCalledWith(now, undefined);
  });

  it("fails linked run items once while leaving legacy checks unlinked", async () => {
    const now = new Date("2026-01-01T06:20:00.000Z");
    const staleChecks = [
      {
        estimatedCostCents: 12,
        id: "rank_linked",
        keyword: { projectId: "project_1", publicId: "kw_a00000000000000000000000" },
        keywordId: "keyword_1",
        provider: "serpapi",
        publicId: "check_a00000000000000000000000",
      },
      {
        estimatedCostCents: 8,
        id: "rank_legacy",
        keyword: { projectId: "project_1", publicId: "kw_b00000000000000000000000" },
        keywordId: "keyword_2",
        provider: "serpapi",
        publicId: "check_b00000000000000000000000",
      },
    ];
    const checkStatuses = new Map(staleChecks.map((check) => [check.id, "running"]));
    let itemStatus = "running";
    let failedCount = 0;

    mocks.prisma.rankCheck.findMany.mockImplementation(async () =>
      staleChecks.filter((check) => checkStatuses.get(check.id) === "running"),
    );
    mocks.prisma.rankCheck.updateMany.mockImplementation(async ({ where }) => {
      let count = 0;
      for (const id of where.id.in) {
        if (checkStatuses.get(id) === "running") {
          checkStatuses.set(id, "failed");
          count += 1;
        }
      }
      return { count };
    });
    mocks.prisma.rankCheckRunItem.findMany.mockImplementation(async () =>
      itemStatus === "running" ? [{ rankCheckId: "rank_linked" }] : [],
    );
    mocks.prisma.rankCheckRunItem.findUnique.mockResolvedValue({
      run: { projectId: "project_1" },
      runId: "run_1",
    });
    mocks.prisma.rankCheckRunItem.updateMany.mockImplementation(async ({ data }) => {
      if (itemStatus !== "running") return { count: 0 };
      itemStatus = data.status;
      return { count: 1 };
    });
    mocks.prisma.rankCheckRun.update.mockImplementation(async ({ data }) => {
      failedCount += data.failedCount.increment;
      return { projectId: "project_1" };
    });

    await expect(markStaleRunningChecks({ now })).resolves.toMatchObject({ failed: 2 });
    await expect(markStaleRunningChecks({ now })).resolves.toMatchObject({ failed: 0 });

    expect(itemStatus).toBe("failed");
    expect(failedCount).toBe(1);
    expect(mocks.prisma.rankCheckRunItem.findMany).toHaveBeenCalledOnce();
    expect(mocks.prisma.rankCheckRunItem.findMany).toHaveBeenCalledWith({
      select: { rankCheckId: true },
      where: {
        rankCheckId: { in: ["rank_linked", "rank_legacy"] },
        status: { in: ["queued", "running"] },
      },
    });
    expect(mocks.prisma.rankCheckRunItem.findUnique).toHaveBeenCalledOnce();
    expect(mocks.prisma.rankCheckRunItem.findUnique).toHaveBeenCalledWith({
      select: {
        run: { select: { id: true, projectId: true, requestedCount: true, status: true } },
        runId: true,
      },
      where: { rankCheckId: "rank_linked" },
    });
    expect(mocks.prisma.rankCheckRun.update).toHaveBeenCalledOnce();
    expect(mocks.prisma.rankCheckRun.update).toHaveBeenCalledWith({
      data: { failedCount: { increment: 1 } },
      where: { id: "run_1" },
    });
    expect(mocks.prisma.rankCheck.updateMany).toHaveBeenCalledOnce();
    expect(mocks.publishOperationChanged).toHaveBeenCalledWith({ projectId: "project_1" });
  });

  it("audits stale failures inside the same transaction as the update", async () => {
    const now = new Date("2026-01-01T06:20:00.000Z");
    const tx = {
      auditLog: { create: vi.fn(() => Promise.resolve({ id: "audit_1" })) },
      rankCheck: {
        findMany: vi.fn(() =>
          Promise.resolve([
            {
              estimatedCostCents: 0.75,
              id: "rank_running_1",
              keyword: { projectId: "project_1", publicId: "kw_a00000000000000000000000" },
              keywordId: "keyword_1",
              provider: "serpapi",
              publicId: "check_a00000000000000000000000",
            },
          ]),
        ),
        updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
      },
      rankCheckRun: { update: vi.fn() },
      rankCheckRunItem: {
        findMany: vi.fn(() => Promise.resolve([])),
        findUnique: vi.fn(),
        updateMany: vi.fn(),
      },
    };
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    mocks.prisma.rankCheck.updateMany.mockResolvedValue({ count: 1 });

    await expect(markStaleRunningChecks({ now })).resolves.toMatchObject({ failed: 1 });

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.rankCheck.updateMany).toHaveBeenCalledWith({
      data: {
        attemptCount: 0,
        degradedToCountry: false,
        error: STALE_RUNNING_CHECK_ERROR,
        estimatedCostCents: null,
        finishedAt: new Date("2026-01-01T06:20:00.000Z"),
        normalizationVersion: null,
        status: "failed",
        viaFallback: false,
      },
      where: { id: { in: ["rank_running_1"] }, status: "running" },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "rank_check.stale_failed",
          actorId: null,
          projectId: "project_1",
          targetId: "check_a00000000000000000000000",
          targetType: "rank_check",
        }),
      }),
    );
  });

  it("rejects invalid stale windows", async () => {
    await expect(markStaleRunningChecks({ olderThanMinutes: 0 })).rejects.toThrow(
      "olderThanMinutes must be a positive finite number.",
    );
    expect(mocks.prisma.rankCheck.updateMany).not.toHaveBeenCalled();
  });
});
