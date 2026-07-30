import { DataForSeoError } from "@/lib/providers/serp/dataforseo-errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectQueuedRankCheckBatch } from "./queued-inspect";

const mocks = vi.hoisted(() => ({
  finalize: vi.fn(),
  consumeProviderLimit: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    queuedRankCheckBatch: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    queuedRankCheckTask: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  ready: vi.fn(),
  writeCooldown: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/credentials", () => ({
  resolveProviderCredentials: vi.fn(() => ({ login: "login", password: "password" })),
}));
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: mocks.consumeProviderLimit,
  writeCooldown: mocks.writeCooldown,
}));
vi.mock("@/lib/providers/serp/dataforseo-queued", () => ({
  dataForSeoQueuedTaskTag: (id: string) => `bisibility:rank:${id}`,
  readyDataForSeoQueuedTasks: mocks.ready,
}));
vi.mock("./queued-lifecycle", () => ({
  finalizeQueuedBatchState: mocks.finalize,
}));
vi.mock("./scheduler-mode", () => ({
  dispatcherClaimsAllowed: (mode: string) => mode === "dispatcher",
  rankCheckSchedulerMode: () => "dispatcher",
}));

describe("inspectQueuedRankCheckBatch", () => {
  beforeEach(() => {
    mocks.prisma.$transaction.mockImplementation((operation) =>
      typeof operation === "function" ? operation(mocks.prisma) : Promise.all(operation),
    );
    mocks.prisma.queuedRankCheckBatch.update.mockResolvedValue({});
    mocks.prisma.queuedRankCheckBatch.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.queuedRankCheckTask.updateMany.mockResolvedValue({ count: 1 });
    mocks.consumeProviderLimit.mockResolvedValue({
      accountKey: "dataforseo:account",
      cooling: false,
      remaining: 100,
      resetAt: Date.now() + 60_000,
      success: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("fails active provider tasks explicitly when their connection was removed", async () => {
    mocks.prisma.queuedRankCheckBatch.findUniqueOrThrow.mockResolvedValue({
      connection: null,
      state: "submitted",
      tasks: [{ id: "qtask_1", state: "submitted" }],
    });
    mocks.prisma.queuedRankCheckTask.findMany.mockResolvedValue([{ state: "provider_failed" }]);

    await expect(inspectQueuedRankCheckBatch("batch_1")).resolves.toEqual({
      ambiguous: 0,
      deadlineReached: false,
      pending: 0,
      ready: 1,
      state: "ready",
      terminal: 0,
    });

    expect(mocks.ready).not.toHaveBeenCalled();
    expect(mocks.prisma.queuedRankCheckTask.updateMany).toHaveBeenCalledWith({
      data: {
        error: "DataForSEO connection was removed during queued result recovery.",
        state: "provider_failed",
      },
      where: {
        batchId: "batch_1",
        state: { in: ["ambiguous", "submitting", "submitted"] },
      },
    });
  });

  it("turns repeated readiness 429 and cooldown responses into pending outcomes", async () => {
    mocks.prisma.queuedRankCheckBatch.findUniqueOrThrow.mockResolvedValue({
      connection: { credentialsEncrypted: "encrypted" },
      projectId: "project_1",
      state: "submitted",
      tasks: [{ id: "qtask_1", state: "submitted" }],
    });
    mocks.prisma.queuedRankCheckTask.findMany.mockResolvedValue([{ state: "submitted" }]);
    mocks.ready.mockRejectedValueOnce(new DataForSeoError("temporary 429", true, 429));

    await expect(inspectQueuedRankCheckBatch("batch_1")).resolves.toMatchObject({
      pending: 1,
      ready: 0,
      state: "submitted",
    });
    expect(mocks.writeCooldown).toHaveBeenCalledWith("dataforseo:account");

    mocks.consumeProviderLimit.mockResolvedValueOnce({
      accountKey: "dataforseo:account",
      cooling: true,
      remaining: 0,
      resetAt: Date.now() + 60_000,
      success: false,
    });
    await expect(inspectQueuedRankCheckBatch("batch_1")).resolves.toMatchObject({
      pending: 1,
      ready: 0,
    });
    expect(mocks.ready).toHaveBeenCalledOnce();
  });

  it("starts no readiness GET when limiter acquisition crosses the absolute deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T00:14:59.000Z"));
    mocks.prisma.queuedRankCheckBatch.findUniqueOrThrow.mockResolvedValue({
      connection: { credentialsEncrypted: "encrypted" },
      projectId: "project_1",
      state: "submitted",
      tasks: [{ id: "qtask_1", state: "submitted" }],
    });
    mocks.prisma.queuedRankCheckTask.findMany.mockResolvedValue([{ state: "submitted" }]);
    mocks.consumeProviderLimit.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date("2026-07-29T00:15:00.000Z"));
      return {
        accountKey: "dataforseo:account",
        cooling: false,
        remaining: 100,
        resetAt: Date.now() + 60_000,
        success: true,
      };
    });
    mocks.ready.mockResolvedValue([]);

    await expect(
      inspectQueuedRankCheckBatch("batch_1", {
        deadlineAt: new Date("2026-07-29T00:15:00.000Z"),
      }),
    ).resolves.toMatchObject({
      deadlineReached: true,
      pending: 1,
      ready: 0,
      state: "submitted",
    });

    expect(mocks.ready).not.toHaveBeenCalled();
  });

  it("terminalizes non-retryable readiness failures instead of stranding the batch", async () => {
    mocks.prisma.queuedRankCheckBatch.findUniqueOrThrow.mockResolvedValue({
      connection: { credentialsEncrypted: "encrypted" },
      projectId: "project_1",
      state: "submitted",
      tasks: [{ id: "qtask_1", state: "submitted" }],
    });
    mocks.prisma.queuedRankCheckTask.findMany.mockResolvedValue([{ state: "provider_failed" }]);
    mocks.ready.mockRejectedValueOnce(new DataForSeoError("credentials rejected", false, 401));

    await expect(inspectQueuedRankCheckBatch("batch_1")).resolves.toMatchObject({
      pending: 0,
      ready: 1,
      state: "ready",
    });
    expect(mocks.prisma.queuedRankCheckTask.updateMany).toHaveBeenCalledWith({
      data: { error: "credentials rejected", state: "provider_failed" },
      where: {
        batchId: "batch_1",
        state: { in: ["ambiguous", "submitting", "submitted"] },
      },
    });
  });
});
