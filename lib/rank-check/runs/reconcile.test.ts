import { beforeEach, describe, expect, it, vi } from "vitest";
import { reclaimStaleRankCheckRunWorkflowClaims, reconcileRankCheckRuns } from "./reconcile";

const mocks = vi.hoisted(() => ({
  publishOperationChanged: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/notifications/realtime", () => ({
  publishOperationChanged: mocks.publishOperationChanged,
}));

type Group = {
  _count: { _all: number };
  _sum: { actualCostCents: number | null };
  keywordId: string;
  status: string;
};

function groups(entries: Array<[string, number, number?]>): Group[] {
  const rows: Group[] = [];
  for (const [status, count, cost = 0] of entries) {
    for (let index = 0; index < count; index += 1) {
      rows.push({
        _count: { _all: 1 },
        _sum: { actualCostCents: index === 0 ? cost : 0 },
        keywordId: `keyword_${rows.length + 1}`,
        status,
      });
    }
  }
  return rows;
}

describe("reconcileRankCheckRuns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("continues reconciling rows without taking ownership of workflow starts", async () => {
    const now = new Date("2026-09-02T08:00:00.000Z");
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = {
      rankCheckRun: {
        findMany: vi.fn(async () => [
          {
            createdAt: new Date(0),
            id: "retry_later",
            orchestrationWorkflowId: "workflow_1",
            projectId: "project_1",
            requestedCount: 1,
            status: "queued",
            updatedAt: now,
          },
          {
            createdAt: new Date(0),
            id: "complete",
            orchestrationWorkflowId: null,
            projectId: "project_1",
            requestedCount: 1,
            status: "running",
            updatedAt: now,
          },
        ]),
        updateMany,
      },
      rankCheckRunItem: {
        groupBy: vi.fn(async ({ where }) =>
          where.runId === "complete" ? groups([["completed", 1]]) : [],
        ),
      },
    };

    await expect(
      reconcileRankCheckRuns({ limit: 10, now }, prisma as never),
    ).resolves.toMatchObject({
      reconciled: 2,
    });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "complete", status: "running" } }),
    );
  });

  it("reclaims a genuinely stale queued claim without a workflow", async () => {
    const now = new Date("2026-09-02T08:00:00.000Z");
    const cutoff = new Date(now.getTime() - 10 * 60_000);
    const claimedAt = new Date(cutoff.getTime() - 1);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findMany = vi.fn(async (query) =>
      query.where.claimedAt.lt.getTime() === cutoff.getTime()
        ? [
            {
              claimedAt,
              id: "orphaned",
              orchestrationWorkflowId: "rank-check-run-rcr_1",
            },
          ]
        : [],
    );
    const prisma = {
      rankCheckRun: {
        findMany,
        updateMany,
      },
    };

    await expect(
      reclaimStaleRankCheckRunWorkflowClaims(
        { limit: 10, now, workflowExists: vi.fn().mockResolvedValue(false) },
        prisma as never,
      ),
    ).resolves.toBe(1);
    expect(findMany).toHaveBeenCalledWith({
      orderBy: { claimedAt: "asc" },
      select: { claimedAt: true, id: true, orchestrationWorkflowId: true },
      take: 10,
      where: {
        claimedAt: { lt: cutoff },
        orchestrationWorkflowId: { not: null },
        status: "queued",
      },
    });
    expect(updateMany).toHaveBeenCalledWith({
      data: { claimedAt: null },
      where: { claimedAt, id: "orphaned", status: "queued" },
    });
  });

  it("leaves a fresh queued claim alone", async () => {
    const now = new Date("2026-09-02T08:00:00.000Z");
    const cutoff = new Date(now.getTime() - 10 * 60_000);
    const claimedAt = new Date(now.getTime() - 9 * 60_000);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const workflowExists = vi.fn().mockResolvedValue(false);
    const findMany = vi.fn(async (query) =>
      claimedAt < query.where.claimedAt.lt
        ? [
            {
              claimedAt,
              id: "fresh",
              orchestrationWorkflowId: "rank-check-run-rcr_1",
            },
          ]
        : [],
    );
    const prisma = {
      rankCheckRun: {
        findMany,
        updateMany,
      },
    };

    await expect(
      reclaimStaleRankCheckRunWorkflowClaims({ limit: 10, now, workflowExists }, prisma as never),
    ).resolves.toBe(0);
    expect(findMany).toHaveBeenCalledWith({
      orderBy: { claimedAt: "asc" },
      select: { claimedAt: true, id: true, orchestrationWorkflowId: true },
      take: 10,
      where: {
        claimedAt: { lt: cutoff },
        orchestrationWorkflowId: { not: null },
        status: "queued",
      },
    });
    expect(workflowExists).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("advances through every pending run when the sweep exceeds the page limit", async () => {
    const now = new Date("2026-09-02T08:00:00.000Z");
    const runs = Array.from({ length: 5 }, (_, index) => ({
      createdAt: new Date(0),
      id: `run_${index + 1}`,
      projectId: "project_1",
      requestedCount: 1,
      status: "running",
    }));
    const findMany = vi.fn(async ({ take, where }) => {
      if (findMany.mock.calls.length > runs.length) {
        throw new Error("pagination did not advance past the previous cursor");
      }
      const cursor = where.id?.gt;
      return runs.filter((run) => !cursor || run.id > cursor).slice(0, take);
    });
    const executeRaw = vi.fn(async () => 1);
    const prisma = {
      $executeRaw: executeRaw,
      rankCheckRun: { findMany, updateMany: vi.fn() },
      rankCheckRunItem: { groupBy: vi.fn(async () => groups([["running", 1]])) },
    };

    await expect(reconcileRankCheckRuns({ limit: 2, now }, prisma as never)).resolves.toEqual({
      hasMore: false,
      reconciled: 5,
      sweepAt: now,
    });
    expect(findMany).toHaveBeenCalledTimes(3);
    expect(findMany.mock.calls.map(([query]) => query.where.id)).toEqual([
      undefined,
      { gt: "run_2" },
      { gt: "run_4" },
    ]);
    expect(executeRaw).toHaveBeenCalledTimes(5);
  });

  it("recomputes counters and derives terminal run state and outcome", async () => {
    const now = new Date("2026-09-02T08:00:00.000Z");
    const runs = [
      {
        createdAt: new Date(0),
        id: "partial",
        projectId: "project_1",
        requestedCount: 7,
        status: "running",
      },
      {
        createdAt: new Date(0),
        id: "success",
        projectId: "project_1",
        requestedCount: 7,
        status: "running",
      },
      {
        createdAt: new Date(0),
        id: "cancelling",
        projectId: "project_1",
        requestedCount: 1,
        status: "cancelling",
      },
      {
        createdAt: new Date(0),
        id: "active",
        projectId: "project_1",
        requestedCount: 3,
        status: "running",
      },
    ];
    const byRun: Record<string, Group[]> = {
      active: groups([
        ["completed", 2, 4],
        ["running", 1],
      ]),
      cancelling: groups([["completed", 1, 2]]),
      partial: groups([
        ["completed", 3, 6],
        ["failed", 1, 1],
        ["deferred", 1],
        ["skipped", 1],
        ["blocked", 1],
      ]),
      success: groups([["completed", 7, 14]]),
    };
    const updates: Array<{ data: Record<string, unknown>; where: { id: string } }> = [];
    const executeRaw = vi.fn(async (_query: { sql: string; values: unknown[] }) => 1);
    const prisma = {
      $executeRaw: executeRaw,
      rankCheckRun: {
        findMany: vi.fn(async () => runs),
        updateMany: vi.fn(async (input) => {
          updates.push(input);
          return { count: 1 };
        }),
      },
      rankCheckRunItem: {
        groupBy: vi.fn(async ({ where }) => byRun[where.runId]),
      },
    };

    const result = await reconcileRankCheckRuns({ limit: 10, now }, prisma as never);

    expect(result).toEqual({ hasMore: false, reconciled: 4, sweepAt: now });
    expect(updates.find((entry) => entry.where.id === "partial")?.data).toEqual({
      cancelledCount: 0,
      completedCount: 3,
      costCents: 7,
      deferredCount: 1,
      failedCount: 1,
      finishedAt: now,
      keywordCount: 7,
      outcome: "partial",
      skippedCount: 2,
      status: "completed",
      targetCount: 7,
      totalCount: 7,
    });
    expect(updates.find((entry) => entry.where.id === "success")?.data).toMatchObject({
      outcome: "succeeded",
      status: "completed",
    });
    expect(updates.find((entry) => entry.where.id === "cancelling")?.data).toMatchObject({
      outcome: "succeeded",
      status: "cancelled",
    });
    expect(updates.find((entry) => entry.where.id === "active")).toBeUndefined();
    expect(executeRaw).toHaveBeenCalledOnce();
    expect(executeRaw.mock.calls[0]?.[0].values).toEqual([
      0,
      2,
      0,
      0,
      0,
      3,
      3,
      3,
      now,
      "active",
      "running",
    ]);
    expect(executeRaw.mock.calls[0]?.[0].sql.replace(/\s+/g, " ")).toContain('"updatedAt" = ?');
    expect(mocks.publishOperationChanged).toHaveBeenCalledTimes(3);
  });

  it("makes claim_lost alone force a partial outcome", async () => {
    const now = new Date("2026-09-02T08:00:00.000Z");
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = {
      rankCheckRun: {
        findMany: vi.fn(async () => [
          { createdAt: new Date(0), id: "claim_lost", requestedCount: 10, status: "running" },
        ]),
        updateMany,
      },
      rankCheckRunItem: {
        groupBy: vi.fn(async () =>
          groups([
            ["completed", 9],
            ["blocked", 1],
          ]),
        ),
      },
    };

    await reconcileRankCheckRuns({ limit: 10, now }, prisma as never);

    expect(updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cancelledCount: 0,
        completedCount: 9,
        deferredCount: 0,
        failedCount: 0,
        outcome: "partial",
        skippedCount: 1,
        totalCount: 10,
      }),
      where: { id: "claim_lost", status: "running" },
    });
  });

  it("keeps active counters monotonic when a transition wins during reconciliation", async () => {
    const now = new Date("2026-09-02T08:00:00.000Z");
    const run = {
      completedCount: 3,
      createdAt: new Date(0),
      id: "active",
      requestedCount: 3,
      status: "running",
      totalCount: 3,
    };
    const executeRaw = vi.fn(async (query: { sql: string; values: unknown[] }) => {
      const [, completedCount, , , , , , totalCount] = query.values;
      run.completedCount = Math.max(run.completedCount, Number(completedCount));
      run.totalCount = Math.max(run.totalCount, Number(totalCount));
      return 1;
    });
    const prisma = {
      $executeRaw: executeRaw,
      rankCheckRun: {
        findMany: vi.fn(async () => [{ ...run }]),
        updateMany: vi.fn(),
      },
      rankCheckRunItem: {
        groupBy: vi.fn(async () =>
          groups([
            ["completed", 2],
            ["running", 1],
          ]),
        ),
      },
    };

    await reconcileRankCheckRuns({ limit: 10, now }, prisma as never);

    expect(run.completedCount).toBe(3);
    expect(prisma.rankCheckRun.updateMany).not.toHaveBeenCalled();
    expect(executeRaw.mock.calls[0]?.[0].sql.replace(/\s+/g, " ")).toContain(
      '"completedCount" = GREATEST("completedCount", ?)',
    );
  });

  it("makes keyword and check counters follow the remaining item rows", async () => {
    const now = new Date("2026-09-04T08:00:00.000Z");
    const run = {
      createdAt: new Date(0),
      id: "run_1",
      keywordCount: 20,
      requestedCount: 20,
      status: "running",
      targetCount: 20,
      totalCount: 20,
    };
    const materializedItems = groups([["queued", 20]]);
    const remainingItems = materializedItems.slice(0, 1);
    const executeRaw = vi.fn(async (query: { sql: string; values: unknown[] }) => {
      const [, , , , , keywordCount, targetCount, totalCount] = query.values;
      run.keywordCount = Number(keywordCount);
      run.targetCount = Number(targetCount);
      run.totalCount = Number(totalCount);
      return 1;
    });
    const prisma = {
      $executeRaw: executeRaw,
      rankCheckRun: { findMany: vi.fn(async () => [{ ...run }]), updateMany: vi.fn() },
      rankCheckRunItem: { groupBy: vi.fn(async () => remainingItems) },
    };

    await reconcileRankCheckRuns({ limit: 10, now }, prisma as never);

    expect(run).toMatchObject({ keywordCount: 1, targetCount: 1, totalCount: 1 });
    expect(materializedItems).toHaveLength(20);
    expect(executeRaw.mock.calls[0]?.[0].sql.replace(/\s+/g, " ")).not.toContain(
      '"totalCount" = GREATEST',
    );
  });

  it("is state-idempotent when the same sweep is applied twice", async () => {
    const now = new Date("2026-09-02T08:00:00.000Z");
    const writes: unknown[] = [];
    const prisma = {
      rankCheckRun: {
        findMany: vi.fn(async () => [
          { createdAt: new Date(0), id: "run_1", requestedCount: 1, status: "running" },
        ]),
        updateMany: vi.fn(async (input) => {
          writes.push(input);
          return { count: 1 };
        }),
      },
      rankCheckRunItem: { groupBy: vi.fn(async () => groups([["completed", 1, 3]])) },
    };

    await reconcileRankCheckRuns({ limit: 10, now }, prisma as never);
    await reconcileRankCheckRuns({ limit: 10, now }, prisma as never);

    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(writes[0]);
  });

  it("finalizes only stale empty runs as deferred", async () => {
    const now = new Date("2026-09-02T08:00:00.000Z");
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = {
      rankCheckRun: {
        findMany: vi.fn(async () => [
          {
            createdAt: new Date("2026-09-02T07:00:00.000Z"),
            id: "stale",
            requestedCount: 1,
            status: "queued",
          },
        ]),
        updateMany,
      },
      rankCheckRunItem: { groupBy: vi.fn(async () => []) },
    };

    await reconcileRankCheckRuns({ limit: 10, now }, prisma as never);

    expect(updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ outcome: "deferred", status: "completed" }),
      where: { id: "stale", status: "queued" },
    });
  });

  it("does not touch an empty run inside the grace period", async () => {
    const now = new Date("2026-09-02T08:00:00.000Z");
    const updateMany = vi.fn();
    const prisma = {
      rankCheckRun: {
        findMany: vi.fn(async () => [
          {
            createdAt: new Date("2026-09-02T07:55:00.000Z"),
            id: "fresh",
            requestedCount: 1,
            status: "queued",
          },
        ]),
        updateMany,
      },
      rankCheckRunItem: { groupBy: vi.fn(async () => []) },
    };

    await reconcileRankCheckRuns({ limit: 10, now }, prisma as never);

    expect(updateMany).not.toHaveBeenCalled();
  });

  it("preserves requested count when fewer items were materialized", async () => {
    const now = new Date("2026-09-02T08:00:00.000Z");
    const run = {
      createdAt: new Date(0),
      id: "run_1",
      requestedCount: 12,
      status: "running",
    };
    const updateMany = vi.fn(async ({ data }) => {
      Object.assign(run, data);
      return { count: 1 };
    });
    const prisma = {
      rankCheckRun: {
        findMany: vi.fn(async () => [{ ...run }]),
        updateMany,
      },
      rankCheckRunItem: { groupBy: vi.fn(async () => groups([["completed", 10]])) },
    };

    await reconcileRankCheckRuns({ limit: 10, now }, prisma as never);

    expect(updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ outcome: "succeeded", totalCount: 10 }),
      where: { id: "run_1", status: "running" },
    });
    expect(updateMany.mock.calls[0]?.[0].data).not.toHaveProperty("requestedCount");
    expect(run.requestedCount).toBe(12);
  });

  it("retries finalization after a concurrent cancellation wins the status change", async () => {
    const now = new Date("2026-09-02T08:00:00.000Z");
    const run = {
      createdAt: new Date(0),
      id: "run_1",
      requestedCount: 1,
      status: "running",
    };
    const updateMany = vi.fn(async ({ data, where }) => {
      if (run.status !== where.status) return { count: 0 };
      Object.assign(run, data);
      return { count: 1 };
    });
    const groupBy = vi
      .fn()
      .mockImplementationOnce(async () => {
        run.status = "cancelling";
        return groups([["cancelled", 1]]);
      })
      .mockImplementationOnce(async () => groups([["cancelled", 1]]));
    const prisma = {
      rankCheckRun: {
        findMany: vi.fn(async () => [{ ...run }]),
        updateMany,
      },
      rankCheckRunItem: { groupBy },
    };

    await reconcileRankCheckRuns({ limit: 10, now }, prisma as never);
    expect(run).toMatchObject({ status: "cancelling" });
    expect(run).not.toHaveProperty("finishedAt");

    await reconcileRankCheckRuns({ limit: 10, now }, prisma as never);
    expect(run).toMatchObject({ finishedAt: now, status: "cancelled" });
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ status: "completed" }),
      where: { id: "run_1", status: "running" },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ status: "cancelled" }),
      where: { id: "run_1", status: "cancelling" },
    });
  });
  it("claims queued work through the worker gateway once per sweep", async () => {
    const now = new Date("2026-09-02T08:00:00.000Z");
    let claimedAt: Date | null = null;
    const status = "queued";
    const findMany = vi.fn(async ({ where }) => {
      if (where.claimedAt === null && where.status === "queued") {
        return status === "queued" && claimedAt === null
          ? [{ id: "queued", orchestrationWorkflowId: "rank-check-run-queued" }]
          : [];
      }
      return [];
    });
    const updateMany = vi.fn(async ({ data, where }) => {
      if (where.claimedAt !== claimedAt || where.status !== status) return { count: 0 };
      claimedAt = data.claimedAt;
      return { count: 1 };
    });
    const startRun = vi.fn().mockResolvedValue({ alreadyExists: false });
    const prisma = {
      rankCheckRun: { findMany, updateMany },
      rankCheckRunItem: { groupBy: vi.fn() },
    };

    await reconcileRankCheckRuns({ limit: 10, now }, prisma as never, {
      startRun,
      workflowExists: vi.fn().mockResolvedValue(false),
    });
    await reconcileRankCheckRuns({ limit: 10, now }, prisma as never, {
      startRun,
      workflowExists: vi.fn().mockResolvedValue(false),
    });

    expect(claimedAt).toBe(now);
    expect(status).toBe("queued");
    expect(startRun).toHaveBeenCalledOnce();
    expect(startRun).toHaveBeenCalledWith({ runId: "queued", workflowId: "rank-check-run-queued" });
  });
});
