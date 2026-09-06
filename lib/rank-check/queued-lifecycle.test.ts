import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deferQueuedRankCheckBatch,
  finalizeQueuedBatchState,
  queuedBatchProgress,
} from "./queued-lifecycle";

const mocks = vi.hoisted(() => {
  const state = {
    batch: "submitted",
    evidenceEntries: 0,
    expiresAt: null as Date | null,
    rankCheckCostCents: null as number | null,
    rankCheck: "running",
    task: "submitted",
    taskCostCents: 0,
    terminalAt: null as Date | null,
  };
  const matches = (value: string, where: { in?: string[]; notIn?: string[] } | string) =>
    typeof where === "string"
      ? value === where
      : (!where.in || where.in.includes(value)) && !where.notIn?.includes(value);
  const prisma = {
    $queryRaw: vi.fn(async () => []),
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
    auditLog: { create: vi.fn(async () => ({ id: "audit_1" })) },
    providerCostEntry: {
      createMany: vi.fn(async () => {
        state.evidenceEntries += 1;
        return { count: 1 };
      }),
    },
    queuedRankCheckBatch: {
      findUniqueOrThrow: vi.fn(async () => ({ state: state.batch })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (typeof data.state === "string") state.batch = data.state;
        if (data.expiresAt instanceof Date) state.expiresAt = data.expiresAt;
        if (data.terminalAt instanceof Date) state.terminalAt = data.terminalAt;
        return { state: state.batch };
      }),
      updateMany: vi.fn(
        async ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: { state: { in?: string[]; notIn?: string[] } | string };
        }) => {
          if (!matches(state.batch, where.state)) return { count: 0 };
          if (typeof data.state === "string") state.batch = data.state;
          if (data.expiresAt instanceof Date) state.expiresAt = data.expiresAt;
          if (data.terminalAt instanceof Date) state.terminalAt = data.terminalAt;
          return { count: 1 };
        },
      ),
    },
    queuedRankCheckTask: {
      findMany: vi.fn(async () => [
        {
          id: "qtask_1",
          batch: { connectionId: "connection_1" },
          costCents: state.taskCostCents,
          error: null,
          keyword: {
            id: "keyword_1",
            projectId: "project_1",
            publicId: "kw_abcdefghijklmnopqrstuvwx",
          },
          rankCheck: {
            previousPosition: null,
            publicId: "check_abcdefghijklmnopqrstuvwx",
            requestedDepth: 100,
            status: state.rankCheck,
          },
          rankCheckId: "rank_1",
          state: state.task,
        },
      ]),
      groupBy: vi.fn(async () => [{ _count: { _all: 1 }, state: state.task }]),
      updateMany: vi.fn(
        async ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: { state: { in?: string[]; notIn?: string[] } | string };
        }) => {
          if (!matches(state.task, where.state)) return { count: 0 };
          if (typeof data.state === "string") state.task = data.state;
          return { count: 1 };
        },
      ),
    },
    rankCheck: {
      findUniqueOrThrow: vi.fn(async () => ({
        publicId: "check_abcdefghijklmnopqrstuvwx",
        status: state.rankCheck,
      })),
      updateMany: vi.fn(
        async ({ data, where }: { data: Record<string, unknown>; where: { status: string } }) => {
          if (state.rankCheck !== where.status) return { count: 0 };
          if ("costCents" in data) state.rankCheckCostCents = Number(data.costCents);
          if (typeof data.status === "string") state.rankCheck = data.status;
          return { count: 1 };
        },
      ),
    },
    rankCheckRun: { update: vi.fn(async () => ({})) },
    rankCheckRunItem: {
      findUnique: vi.fn(async (): Promise<{ runId: string } | null> => null),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  return {
    claimLease: vi.fn(),
    prisma,
    publishOperationChanged: vi.fn(() => Promise.resolve()),
    state,
    transitionLease: vi.fn(),
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/notifications/realtime", () => ({
  publishOperationChanged: mocks.publishOperationChanged,
}));
vi.mock("./queued-persistence-lease", () => ({
  assertQueuedPersistenceLease: vi.fn(),
  claimQueuedPersistenceLease: mocks.claimLease,
  transitionQueuedPersistenceLease: mocks.transitionLease,
}));

describe("queuedBatchProgress", () => {
  it("reports deferred tasks in processed and total counts", async () => {
    mocks.prisma.queuedRankCheckTask.groupBy.mockResolvedValueOnce([
      { _count: { _all: 3 }, state: "completed" },
      { _count: { _all: 1 }, state: "failed" },
      { _count: { _all: 2 }, state: "deferred" },
      { _count: { _all: 4 }, state: "submitted" },
    ]);

    const progress = await queuedBatchProgress("batch_1");

    expect(progress).toMatchObject({ completed: 3, deferred: 2, failed: 1, pending: 4 });
    expect(progress.completed + progress.failed + progress.deferred).toBe(6);
    expect(progress.completed + progress.failed + progress.deferred + progress.pending).toBe(10);
  });
});

describe("queued ledger compare-and-set transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.publishOperationChanged.mockResolvedValue(undefined);
    mocks.state.batch = "submitted";
    mocks.state.evidenceEntries = 0;
    mocks.state.expiresAt = null;
    mocks.state.rankCheckCostCents = null;
    mocks.state.rankCheck = "running";
    mocks.state.task = "submitted";
    mocks.state.taskCostCents = 0;
    mocks.state.terminalAt = null;
    mocks.claimLease.mockResolvedValue({
      expiresAt: new Date("2026-07-29T05:03:00.000Z"),
      owner: "deadline-owner",
      taskId: "qtask_1",
    });
    mocks.transitionLease.mockImplementation(async (_lease, _from, data) => {
      mocks.state.task = data.state;
      return data.state;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not let a late defer overwrite terminal completion", async () => {
    mocks.state.rankCheck = "completed";
    mocks.state.task = "persisting";

    await expect(deferQueuedRankCheckBatch("batch_1", "deadline")).resolves.toMatchObject({
      pending: 0,
      state: "completed",
    });

    expect(mocks.state.rankCheck).toBe("completed");
    expect(mocks.state.task).toBe("completed");
    expect(mocks.state.batch).toBe("completed");
  });

  it("makes duplicate finalization preserve the first terminal timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T05:00:00.000Z"));
    mocks.state.rankCheck = "completed";
    mocks.state.task = "completed";

    await finalizeQueuedBatchState("batch_1");
    const firstTerminalAt = mocks.state.terminalAt;
    vi.setSystemTime(new Date("2026-07-29T06:00:00.000Z"));
    await finalizeQueuedBatchState("batch_1");

    expect(firstTerminalAt).toEqual(new Date("2026-07-29T05:00:00.000Z"));
    expect(mocks.state.terminalAt).toEqual(firstTerminalAt);
    expect(mocks.prisma.queuedRankCheckBatch.updateMany).toHaveBeenCalledTimes(2);
  });

  it("keeps a timeout retry idempotent after the first defer wins", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T05:00:00.000Z"));

    await deferQueuedRankCheckBatch("batch_1", "deadline");
    const firstTerminalAt = mocks.state.terminalAt;
    vi.setSystemTime(new Date("2026-07-29T06:00:00.000Z"));
    await deferQueuedRankCheckBatch("batch_1", "deadline");

    expect(mocks.state.rankCheck).toBe("deferred");
    expect(mocks.state.task).toBe("deferred");
    expect(mocks.state.batch).toBe("deferred");
    expect(mocks.state.terminalAt).toEqual(firstTerminalAt);
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledOnce();
  });

  it("transitions a linked queued task defer and increments its run", async () => {
    let transactionResolved = false;
    mocks.prisma.rankCheckRunItem.findUnique.mockResolvedValue({ runId: "run_1" });
    mocks.prisma.rankCheckRunItem.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.$transaction.mockImplementation(async (callback) => {
      const result = await callback(mocks.prisma);
      transactionResolved = true;
      return result;
    });
    mocks.publishOperationChanged.mockImplementation(async () => {
      expect(transactionResolved).toBe(true);
      throw new Error("Redis unavailable");
    });

    await expect(deferQueuedRankCheckBatch("batch_1", "deadline")).resolves.toBeDefined();

    expect(mocks.prisma.rankCheckRunItem.updateMany).toHaveBeenCalledWith({
      data: { finishedAt: expect.any(Date), status: "deferred" },
      where: { rankCheckId: "rank_1", status: { in: ["queued", "running"] } },
    });
    expect(mocks.prisma.rankCheckRun.update).toHaveBeenCalledWith({
      data: { deferredCount: { increment: 1 } },
      where: { id: "run_1" },
    });
    expect(mocks.publishOperationChanged).toHaveBeenCalledOnce();
    expect(mocks.publishOperationChanged).toHaveBeenCalledWith({ projectId: "project_1" });
  });

  it("records a known paid deadline charge once in canonical failed spend", async () => {
    mocks.state.task = "ready";
    mocks.state.taskCostCents = 2.4;

    await deferQueuedRankCheckBatch("batch_1", "deadline");
    await deferQueuedRankCheckBatch("batch_1", "deadline");

    expect(mocks.state.rankCheck).toBe("failed");
    expect(mocks.state.rankCheckCostCents).toBe(2.4);
    expect(mocks.state.task).toBe("failed");
    expect(mocks.state.batch).toBe("failed");
    expect(mocks.state.evidenceEntries).toBe(1);
  });

  it("leaves a live persistence owner untouched until a later timeout retry", async () => {
    mocks.state.task = "persisting";
    mocks.claimLease.mockResolvedValueOnce(null);

    await expect(deferQueuedRankCheckBatch("batch_1", "deadline")).resolves.toMatchObject({
      pending: 1,
      state: "submitted",
    });
    expect(mocks.state.rankCheck).toBe("running");
    expect(mocks.state.task).toBe("persisting");
    expect(mocks.prisma.rankCheck.updateMany).not.toHaveBeenCalled();

    await expect(deferQueuedRankCheckBatch("batch_1", "deadline")).resolves.toMatchObject({
      pending: 0,
      state: "deferred",
    });
    expect(mocks.state.rankCheck).toBe("deferred");
    expect(mocks.state.task).toBe("deferred");
  });
});
