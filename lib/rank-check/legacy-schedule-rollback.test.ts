import { describe, expect, it, vi } from "vitest";
import { runLegacyScheduleRollback } from "./legacy-schedule-rollback";

const coverage = {
  coverageCountsStable: true,
  eligible: 1,
  eligibleWithState: 1,
  exact: true,
  gone: 0,
  ineligible: 0,
  maxNextCheckAt: null,
  minNextCheckAt: null,
  missing: 0,
  oldestDueLagMs: 0,
  recurrenceMismatches: 0,
  recurrenceScanRows: 1,
  recurrenceScanStable: true,
};

const input = {
  keywordId: "k1",
  projectId: "p1",
  schedule: {
    cronExpression: null,
    frequency: "monthly" as const,
    jitterMinutes: 10,
    nextCheckAt: new Date("2026-08-17T09:30:00.000Z"),
    timezone: "Europe/Warsaw",
  },
};

const secondInput = {
  ...input,
  keywordId: "k2",
};

const quiescence = {
  evidence: {} as never,
  ready: true,
  reasons: [],
};

function store() {
  let schedulerCount = 5;
  const pausedOwnedIds: string[] = [];
  const ensurePaused = vi.fn(async (value = input) => {
    schedulerCount += 1;
    pausedOwnedIds.push(`rank-check-${value.keywordId}`);
    return "created";
  });
  return {
    coverage: vi.fn().mockResolvedValue(coverage),
    ensurePaused,
    inventory: vi.fn(async () => ({
      ownedIds: [...pausedOwnedIds],
      pausedOwnedIds: [...pausedOwnedIds],
      unrelatedHash: "stable",
      unrelatedIds: ["maintenance-a"],
    })),
    preflight: vi.fn().mockResolvedValue({ claimsStopped: true, paidInFlightSafe: true }),
    readPage: vi.fn().mockResolvedValue({ cursor: "k1", done: true, rows: [input] }),
    schedulerCount: vi.fn(async () => schedulerCount),
    verify: vi.fn().mockResolvedValue({ exact: true, missing: 0, unexpected: 0 }),
    writerQuiescence: vi.fn().mockResolvedValue(quiescence),
  };
}

describe("runLegacyScheduleRollback", () => {
  it("upgrades a v1 checkpoint to the crash-resumable format", async () => {
    const adapter = store();
    adapter.schedulerCount.mockResolvedValue(6);
    adapter.readPage.mockResolvedValue({ cursor: "k1", done: true, rows: [] });

    const result = await runLegacyScheduleRollback({
      dryRun: true,
      initialCheckpoint: {
        baselineUnrelatedHash: "stable",
        cursor: "k1",
        totals: { created: 1, exact: 0, failed: 0, page: 1, selected: 1, updated: 0 },
        version: 1,
      },
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      store: adapter,
    });

    expect(result.verdict).toBe("PASS");
    expect(result.checkpoint).toMatchObject({
      baselineSchedulerCount: 5,
      pageProgress: [],
      pending: null,
      phase: "create",
      version: 3,
    });
  });

  it("stabilizes scheduler visibility before deriving a v1 checkpoint baseline", async () => {
    const adapter = store();
    adapter.schedulerCount.mockResolvedValueOnce(5).mockResolvedValue(6);
    adapter.readPage.mockResolvedValue({ cursor: "k1", done: true, rows: [] });

    const result = await runLegacyScheduleRollback({
      dryRun: true,
      initialCheckpoint: {
        baselineUnrelatedHash: "stable",
        cursor: "k1",
        totals: { created: 1, exact: 0, failed: 0, page: 1, selected: 1, updated: 0 },
        version: 1,
      },
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 4 },
      store: adapter,
    });

    expect(result.verdict).toBe("PASS");
    expect(result.checkpoint.baselineSchedulerCount).toBe(5);
  });

  it("upgrades a v2 checkpoint without changing its scheduler baseline", async () => {
    const adapter = store();
    adapter.readPage.mockResolvedValue({ cursor: "k1", done: true, rows: [] });

    const result = await runLegacyScheduleRollback({
      dryRun: true,
      initialCheckpoint: {
        baselineSchedulerCount: 5,
        baselineUnrelatedHash: "stable",
        cursor: "k1",
        phase: "create",
        totals: { created: 0, exact: 0, failed: 0, page: 1, selected: 1, updated: 0 },
        version: 2,
      },
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      store: adapter,
    });

    expect(result.verdict).toBe("PASS");
    expect(result.checkpoint).toMatchObject({
      baselineSchedulerCount: 5,
      pageProgress: [],
      pending: null,
      phase: "create",
      version: 3,
    });
  });

  it("preserves dispatcher nextCheckAt as the monthly rollback anchor", async () => {
    const adapter = store();
    const result = await runLegacyScheduleRollback({
      dryRun: false,
      pageSize: 10,
      store: adapter,
    });
    expect(result.verdict).toBe("PASS");
    expect(adapter.ensurePaused).toHaveBeenCalledWith(input);
  });

  it("checkpoints interruption and resumes after the cursor", async () => {
    const adapter = store();
    adapter.readPage.mockResolvedValue({ cursor: "k1", done: false, rows: [input] });
    const result = await runLegacyScheduleRollback({
      dryRun: false,
      pageSize: 1,
      stopAfterBatch: true,
      store: adapter,
    });
    expect(result.verdict).toBe("INCOMPLETE");
    expect(result.checkpoint.cursor).toBe("k1");
    expect(result.checkpoint.version).toBe(3);
  });

  it("tolerates an already-existing exact paused Schedule", async () => {
    const adapter = store();
    adapter.ensurePaused.mockResolvedValue("exact");
    const result = await runLegacyScheduleRollback({
      dryRun: false,
      pageSize: 10,
      store: adapter,
    });
    expect(result.checkpoint.totals.exact).toBe(1);
  });

  it("fails closed on a conflicting ambiguous Schedule", async () => {
    const adapter = store();
    adapter.ensurePaused.mockRejectedValue(new Error("ambiguous schedule"));
    const result = await runLegacyScheduleRollback({
      dryRun: false,
      pageSize: 10,
      store: adapter,
    });
    expect(result.verdict).toBe("FAIL");
    expect(result.hardGateReasons).toContain("rollback-schedule-conflict");
  });

  it("fails when recreated Schedules violate global scheduler conservation", async () => {
    const adapter = store();
    adapter.schedulerCount
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(999)
      .mockResolvedValueOnce(999)
      .mockResolvedValueOnce(999);
    const result = await runLegacyScheduleRollback({
      dryRun: false,
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      store: adapter,
    });

    expect(result.verdict).toBe("FAIL");
    expect(result.hardGateReasons).toContain("global-scheduler-conservation");
    expect(result.schedulerCounts).toMatchObject({ samples: [999, 999, 999] });
  });

  it("does not mask scheduler loss as eligibility reconciliation", async () => {
    const adapter = store();
    adapter.verify.mockResolvedValue({ exact: false, missing: 1, unexpected: 0 });
    adapter.schedulerCount
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);

    const result = await runLegacyScheduleRollback({
      dryRun: false,
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      store: adapter,
    });

    expect(result.verdict).toBe("FAIL");
    expect(result.hardGateReasons).toContain("global-scheduler-conservation");
    expect(result.checkpoint.phase).toBe("create");
  });

  it("resets a terminal cursor for bounded reconciliation after eligibility churn", async () => {
    const firstStore = store();
    firstStore.readPage.mockResolvedValue({ cursor: "k2", done: true, rows: [input] });
    firstStore.verify.mockResolvedValue({ exact: false, missing: 1, unexpected: 0 });

    const first = await runLegacyScheduleRollback({
      dryRun: false,
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      store: firstStore,
    });

    expect(first.verdict).toBe("INCOMPLETE");
    expect(first.checkpoint).toMatchObject({ cursor: null, phase: "reconcile" });

    const secondStore = store();
    secondStore.ensurePaused.mockResolvedValue("created");
    secondStore.schedulerCount
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(6)
      .mockResolvedValue(7);
    const second = await runLegacyScheduleRollback({
      dryRun: false,
      initialCheckpoint: first.checkpoint,
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      store: secondStore,
    });

    expect(second.verdict).toBe("PASS");
    expect(secondStore.readPage).toHaveBeenCalledWith(null, 10);
  });

  it("recovers a mutation that completed before per-mutation progress persisted", async () => {
    const firstStore = store();
    type ResultCheckpoint = Awaited<ReturnType<typeof runLegacyScheduleRollback>>["checkpoint"];
    let persisted: ResultCheckpoint | undefined;
    let checkpointWrites = 0;

    await expect(
      runLegacyScheduleRollback({
        dryRun: false,
        onCheckpoint: async (checkpoint) => {
          checkpointWrites += 1;
          if (checkpointWrites === 1) persisted = structuredClone(checkpoint);
          else throw new Error("simulated process failure");
        },
        pageSize: 10,
        schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
        store: firstStore,
      }),
    ).rejects.toThrow("simulated process failure");
    expect(persisted?.pending).toEqual({
      existedBefore: false,
      scheduleId: "rank-check-k1",
    });

    const resumed = await runLegacyScheduleRollback({
      dryRun: false,
      initialCheckpoint: persisted,
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      store: firstStore,
    });

    expect(resumed.verdict).toBe("PASS");
    expect(resumed.checkpoint.totals.created).toBe(1);
    expect(firstStore.ensurePaused).toHaveBeenCalledTimes(1);
  });

  it("preserves write-ahead intent when mutation acknowledgement is ambiguous", async () => {
    const adapter = store();
    const mutate = adapter.ensurePaused.getMockImplementation();
    adapter.ensurePaused.mockImplementationOnce(async (value = input) => {
      await mutate?.(value);
      throw new Error("acknowledgement lost");
    });
    type ResultCheckpoint = Awaited<ReturnType<typeof runLegacyScheduleRollback>>["checkpoint"];
    let persisted: ResultCheckpoint | undefined;

    const first = await runLegacyScheduleRollback({
      dryRun: false,
      onCheckpoint: async (checkpoint) => {
        persisted = structuredClone(checkpoint);
      },
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      store: adapter,
    });

    expect(first.verdict).toBe("FAIL");
    expect(persisted?.pending).toEqual({
      existedBefore: false,
      scheduleId: "rank-check-k1",
    });

    const resumed = await runLegacyScheduleRollback({
      dryRun: false,
      initialCheckpoint: persisted,
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      store: adapter,
    });

    expect(resumed.verdict).toBe("PASS");
    expect(resumed.checkpoint.totals.created).toBe(1);
    expect(adapter.ensurePaused).toHaveBeenCalledTimes(1);
  });

  it("reconciles pending intent after bounded stale inventory visibility", async () => {
    const adapter = store();
    adapter.inventory
      .mockResolvedValueOnce({
        ownedIds: [],
        pausedOwnedIds: [],
        unrelatedHash: "stable",
        unrelatedIds: ["maintenance-a"],
      })
      .mockResolvedValue({
        ownedIds: ["rank-check-k1"],
        pausedOwnedIds: ["rank-check-k1"],
        unrelatedHash: "stable",
        unrelatedIds: ["maintenance-a"],
      });
    adapter.schedulerCount.mockResolvedValue(6);
    const checkpoint = {
      baselineSchedulerCount: 5,
      baselineUnrelatedHash: "stable",
      cursor: null,
      pageProgress: [],
      pending: { existedBefore: false, scheduleId: "rank-check-k1" },
      phase: "create" as const,
      totals: { created: 0, exact: 0, failed: 0, page: 0, selected: 0, updated: 0 },
      version: 3 as const,
    };

    const result = await runLegacyScheduleRollback({
      dryRun: false,
      initialCheckpoint: checkpoint,
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      store: adapter,
    });

    expect(result.verdict).toBe("PASS");
    expect(result.checkpoint.totals.created).toBe(1);
    expect(adapter.inventory).toHaveBeenCalledTimes(3);
    expect(adapter.ensurePaused).not.toHaveBeenCalled();
  });

  it("retries safely when a persisted intent has no acknowledged Schedule", async () => {
    const adapter = store();
    const checkpoint = {
      baselineSchedulerCount: 5,
      baselineUnrelatedHash: "stable",
      cursor: null,
      pageProgress: [],
      pending: { existedBefore: false, scheduleId: "rank-check-k1" },
      phase: "create" as const,
      totals: { created: 0, exact: 0, failed: 0, page: 0, selected: 0, updated: 0 },
      version: 3 as const,
    };

    const result = await runLegacyScheduleRollback({
      dryRun: false,
      initialCheckpoint: checkpoint,
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      store: adapter,
    });

    expect(result.verdict).toBe("PASS");
    expect(adapter.ensurePaused).toHaveBeenCalledTimes(1);
    expect(result.checkpoint.totals.created).toBe(1);
  });

  it("checkpoints each successful mutation within a page", async () => {
    const adapter = store();
    adapter.readPage.mockResolvedValue({
      cursor: "k2",
      done: true,
      rows: [input, secondInput],
    });
    const checkpoints: Array<{ pending: unknown; progress: number }> = [];

    const result = await runLegacyScheduleRollback({
      dryRun: false,
      onCheckpoint: async (checkpoint) => {
        checkpoints.push({
          pending: checkpoint.pending,
          progress: checkpoint.pageProgress.length,
        });
      },
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      store: adapter,
    });

    expect(result.verdict).toBe("PASS");
    expect(checkpoints).toEqual(
      expect.arrayContaining([
        { pending: { existedBefore: false, scheduleId: "rank-check-k1" }, progress: 0 },
        { pending: null, progress: 1 },
        { pending: { existedBefore: false, scheduleId: "rank-check-k2" }, progress: 1 },
        { pending: null, progress: 2 },
      ]),
    );
  });

  it("refuses mutation when writer quiescence is not proven", async () => {
    const adapter = store();
    adapter.writerQuiescence.mockResolvedValue({
      evidence: {} as never,
      ready: false,
      reasons: ["worker-heartbeat-future"],
    });

    const result = await runLegacyScheduleRollback({
      dryRun: false,
      pageSize: 10,
      store: adapter,
    });

    expect(result.verdict).toBe("FAIL");
    expect(result.hardGateReasons).toContain("worker-heartbeat-future");
    expect(adapter.ensurePaused).not.toHaveBeenCalled();
  });
});
