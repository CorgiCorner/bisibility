import { afterEach, describe, expect, it, vi } from "vitest";
import { submitQueuedRankCheckBatch } from "../queued-submit";
import { cancelRankCheckRun, closeRankCheckAsCancelled } from "./cancel";

const batchMocks = vi.hoisted(() => {
  const state = { batch: "prepared", run: "running", task: "prepared" };
  const batch = () => ({
    connection: { credentialsEncrypted: "encrypted", id: "connection_1" },
    id: "batch_1",
    priority: "high",
    project: { defaults: { serpStopOnMatch: true }, domain: "example.com" },
    projectId: "project_1",
    runId: "run_1",
    state: state.batch,
    tasks: [
      {
        id: "qtask_1",
        keyword: {
          device: "desktop",
          locationRef: {
            canonicalKey: "country:us",
            countryCode: "US",
            displayName: "United States",
            gl: "us",
            hl: "en",
            id: "location_1",
            kind: "country",
            languageLabel: "English",
            primaryGeoCode: 2840,
            primaryGeoName: "United States",
            secondaryGeoName: "United States",
          },
          text: "cancelled batch keyword",
        },
        rankCheck: { requestedDepth: 100 },
      },
    ],
  });
  const prisma = {
    $executeRaw: vi.fn(),
    $transaction: vi.fn(async (input: unknown) => {
      if (typeof input === "function") return input(prisma);
      return Promise.all(input as Promise<unknown>[]);
    }),
    queuedRankCheckBatch: {
      findUniqueOrThrow: vi.fn(async () => batch()),
      updateMany: vi.fn(
        async ({ data, where }: { data: { state?: string }; where: { state: string } }) => {
          if (state.batch !== where.state) return { count: 0 };
          if (data.state) state.batch = data.state;
          return { count: 1 };
        },
      ),
    },
    queuedRankCheckTask: {
      updateMany: vi.fn(
        async ({ data, where }: { data: { state?: string }; where: { state?: string } }) => {
          if (where.state && state.task !== where.state) return { count: 0 };
          if (data.state) state.task = data.state;
          return { count: 1 };
        },
      ),
    },
    rankCheckRun: {
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async ({ data, where }) => {
        if (where.status === "planned" || state.run !== "running") return { count: 0 };
        state.run = data.status;
        return { count: 1 };
      }),
    },
    rankCheckRunItem: { updateMany: vi.fn(async () => ({ count: 0 })) },
  };
  return {
    assertAllocation: vi.fn(),
    consumeLimit: vi.fn(),
    paidProviderCall: vi.fn(),
    prisma,
    state,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: batchMocks.prisma }));
vi.mock("../allocation-enforcement", () => ({
  assertQueuedRankCheckBatchAllocation: batchMocks.assertAllocation,
}));
vi.mock("@/lib/providers/credentials", () => ({
  resolveProviderCredentials: () => ({ login: "login", password: "password" }),
}));
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: batchMocks.consumeLimit,
  writeCooldown: vi.fn(),
}));
vi.mock("@/lib/providers/serp/dataforseo-errors", () => ({
  DataForSeoError: class DataForSeoError extends Error {},
}));
vi.mock("@/lib/providers/serp/dataforseo-queued", () => ({
  DataForSeoAmbiguousSubmissionError: class DataForSeoAmbiguousSubmissionError extends Error {},
  submitDataForSeoQueuedTasks: batchMocks.paidProviderCall,
}));

describe("rank-check run cancellation", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("cancels a planned occurrence without reading or changing items", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T08:00:00.000Z"));
    const tx = {
      rankCheckRun: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      rankCheckRunItem: { updateMany: vi.fn() },
    };

    await expect(cancelRankCheckRun(tx as never, "run_1")).resolves.toBe(true);

    expect(tx.rankCheckRun.updateMany).toHaveBeenCalledOnce();
    expect(tx.rankCheckRun.updateMany).toHaveBeenCalledWith({
      data: { finishedAt: new Date("2026-09-02T08:00:00.000Z"), status: "cancelled" },
      where: { id: "run_1", status: "planned" },
    });
    expect(tx.rankCheckRunItem.updateMany).not.toHaveBeenCalled();
  });

  it("cancels queued and claimed-unlinked items once", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T08:00:00.000Z"));
    const tx = {
      queuedRankCheckBatch: { updateMany: vi.fn(async () => ({ count: 0 })) },
      queuedRankCheckTask: { updateMany: vi.fn(async () => ({ count: 0 })) },
      rankCheckRun: {
        findUnique: vi.fn(async () => null),
        update: vi.fn(async () => ({})),
        updateMany: vi
          .fn()
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 0 }),
      },
      rankCheckRunItem: { updateMany: vi.fn(async () => ({ count: 2 })) },
    };

    await cancelRankCheckRun(tx as never, "run_1");
    await cancelRankCheckRun(tx as never, "run_1");

    expect(tx.rankCheckRunItem.updateMany).toHaveBeenCalledOnce();
    expect(tx.rankCheckRunItem.updateMany).toHaveBeenCalledWith({
      data: {
        claimExpiresAt: null,
        finishedAt: new Date("2026-09-02T08:00:00.000Z"),
        status: "cancelled",
      },
      where: {
        OR: [{ status: "queued" }, { rankCheckId: null, status: "running" }],
        runId: "run_1",
      },
    });
    expect(tx.rankCheckRun.update).toHaveBeenCalledWith({
      data: { cancelledCount: { increment: 2 } },
      where: { id: "run_1" },
    });
  });

  it("cancels a blocked run before it can be reconciled again", async () => {
    const tx = {
      queuedRankCheckBatch: { updateMany: vi.fn(async () => ({ count: 0 })) },
      queuedRankCheckTask: { updateMany: vi.fn(async () => ({ count: 0 })) },
      rankCheckRun: {
        findUnique: vi.fn(async () => null),
        update: vi.fn(async () => ({})),
        updateMany: vi.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 }),
      },
      rankCheckRunItem: { updateMany: vi.fn(async () => ({ count: 0 })) },
    };

    await expect(cancelRankCheckRun(tx as never, "run_1")).resolves.toBe(true);

    expect(tx.rankCheckRun.updateMany).toHaveBeenLastCalledWith({
      data: { status: "cancelling" },
      where: { id: "run_1", status: { in: ["blocked", "queued", "running"] } },
    });
  });

  it("keeps a linked running item on the existing close-check path", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const tx = {
      queuedRankCheckBatch: { updateMany: vi.fn(async () => ({ count: 0 })) },
      queuedRankCheckTask: { updateMany: vi.fn(async () => ({ count: 0 })) },
      rankCheckRun: {
        findUnique: vi.fn(async () => null),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 }),
      },
      rankCheckRunItem: { updateMany },
    };

    await cancelRankCheckRun(tx as never, "run_1");

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ status: "queued" }, { rankCheckId: null, status: "running" }],
          runId: "run_1",
        },
      }),
    );
    expect(tx.rankCheckRun.update).not.toHaveBeenCalled();
  });

  it("defers a prepared queued batch and its tasks in the cancellation transaction", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T08:00:00.000Z"));
    const tx = {
      queuedRankCheckBatch: { updateMany: vi.fn(async () => ({ count: 1 })) },
      queuedRankCheckTask: { updateMany: vi.fn(async () => ({ count: 1 })) },
      rankCheckRun: {
        findUnique: vi.fn(async () => null),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 }),
      },
      rankCheckRunItem: { updateMany: vi.fn(async () => ({ count: 0 })) },
    };

    await cancelRankCheckRun(tx as never, "run_1");

    expect(tx.queuedRankCheckBatch.updateMany).toHaveBeenCalledWith({
      data: {
        error: "Cancelled by the run.",
        expiresAt: new Date("2026-10-02T08:00:00.000Z"),
        state: "deferred",
        terminalAt: new Date("2026-09-02T08:00:00.000Z"),
      },
      where: { runId: "run_1", state: "prepared" },
    });
    expect(tx.queuedRankCheckTask.updateMany).toHaveBeenCalledWith({
      data: { error: "Cancelled by the run.", state: "deferred" },
      where: { batch: { runId: "run_1" }, state: "prepared" },
    });
  });

  it("closes an in-flight check and its running item exactly once", async () => {
    const tx = {
      rankCheck: {
        updateMany: vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }),
      },
      rankCheckRun: { update: vi.fn(async () => ({})) },
      rankCheckRunItem: {
        findUnique: vi.fn(async () => ({ runId: "run_1" })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };

    await closeRankCheckAsCancelled(tx as never, "rank_1");
    await closeRankCheckAsCancelled(tx as never, "rank_1");

    expect(tx.rankCheck.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.rankCheck.updateMany).toHaveBeenCalledWith({
      data: {
        errorCode: "cancelled",
        error: "Cancelled by the run.",
        estimatedCostCents: null,
        finishedAt: expect.any(Date),
        status: "failed",
      },
      where: { id: "rank_1", status: "running" },
    });
    expect(tx.rankCheckRunItem.updateMany).toHaveBeenCalledOnce();
    expect(tx.rankCheckRun.update).toHaveBeenCalledOnce();
  });

  it("refuses a paid provider call when a prepared batch resumes after cancellation commits", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    vi.stubEnv("DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED", "1");
    batchMocks.state.batch = "prepared";
    batchMocks.state.run = "running";
    batchMocks.state.task = "prepared";
    batchMocks.assertAllocation.mockResolvedValue(undefined);
    batchMocks.consumeLimit.mockResolvedValue({
      accountKey: "dataforseo:account",
      success: true,
    });
    batchMocks.paidProviderCall.mockResolvedValue({ accepted: [], failed: [] });
    let cancellationCommitted = false;

    await batchMocks.prisma.$transaction(async (tx: typeof batchMocks.prisma) => {
      await cancelRankCheckRun(tx as never, "run_1");
      cancellationCommitted = true;
    });

    expect(cancellationCommitted).toBe(true);
    await submitQueuedRankCheckBatch("batch_1");
    expect(batchMocks.paidProviderCall).toHaveBeenCalledTimes(0);
  });
});
