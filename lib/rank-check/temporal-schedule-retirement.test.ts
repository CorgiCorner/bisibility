import { describe, expect, it, vi } from "vitest";
import { runOwnedScheduleRetirement } from "./temporal-schedule-retirement";

const coverage = {
  coverageCountsStable: true,
  eligible: 2,
  eligibleWithState: 2,
  exact: true,
  gone: 0,
  ineligible: 0,
  maxNextCheckAt: null,
  minNextCheckAt: null,
  missing: 0,
  oldestDueLagMs: 0,
  recurrenceMismatches: 0,
  recurrenceScanRows: 2,
  recurrenceScanStable: true,
};

const quiescence = {
  evidence: {} as never,
  ready: true,
  reasons: [],
};

function inventory(overrides = {}) {
  return {
    ambiguousIds: [],
    dispatcher: "paused" as const,
    failed: 0,
    inspected: 4,
    listed: 4,
    ownedIds: ["rank-check-k1", "rank-check-k2"],
    pausedOwnedIds: [],
    reconciler: "paused" as const,
    unrelatedHash: "stable-hash",
    unrelatedIds: ["maintenance-a", "dispatcher-rank-checks"],
    ...overrides,
  };
}

describe("runOwnedScheduleRetirement", () => {
  it("keeps dry run pure", async () => {
    const store = {
      coverage: vi.fn().mockResolvedValue(coverage),
      delete: vi.fn(),
      inventory: vi.fn().mockResolvedValue(inventory()),
      pause: vi.fn(),
      schedulerCount: vi.fn().mockResolvedValue(4),
      writerQuiescence: vi.fn().mockResolvedValue(quiescence),
    };
    const result = await runOwnedScheduleRetirement({
      dryRun: true,
      pageSize: 1,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      store,
    });
    expect(result.verdict).toBe("PASS");
    expect(store.pause).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it("pauses before delete and checkpoints an interrupted batch", async () => {
    const order: string[] = [];
    const store = {
      coverage: vi.fn().mockResolvedValue(coverage),
      delete: vi.fn(async (id: string) => order.push(`delete:${id}`)),
      inventory: vi.fn().mockResolvedValue(inventory()),
      pause: vi.fn(async (id: string) => order.push(`pause:${id}`)),
      schedulerCount: vi.fn().mockResolvedValue(4),
      writerQuiescence: vi.fn().mockResolvedValue(quiescence),
    };
    const result = await runOwnedScheduleRetirement({
      dryRun: false,
      pageSize: 1,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      stopAfterBatch: true,
      store,
    });
    expect(order).toEqual(["pause:rank-check-k1", "delete:rank-check-k1"]);
    expect(result.verdict).toBe("INCOMPLETE");
    expect(result.checkpoint.lastAttemptedIds).toEqual(["rank-check-k1"]);
    expect(result.counts.remaining).toBe(1);
  });

  it("hard fails on an ambiguous prefix match and leaves all schedules untouched", async () => {
    const store = {
      coverage: vi.fn().mockResolvedValue(coverage),
      delete: vi.fn(),
      inventory: vi.fn().mockResolvedValue(inventory({ ambiguousIds: ["rank-check-not-owned"] })),
      pause: vi.fn(),
      schedulerCount: vi.fn().mockResolvedValue(4),
      writerQuiescence: vi.fn().mockResolvedValue(quiescence),
    };
    const result = await runOwnedScheduleRetirement({
      dryRun: false,
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      store,
    });
    expect(result.verdict).toBe("FAIL");
    expect(store.pause).not.toHaveBeenCalled();
  });

  it("accepts conservation, not a zero global scheduler count", async () => {
    const store = {
      coverage: vi.fn().mockResolvedValue(coverage),
      delete: vi.fn(),
      inventory: vi
        .fn()
        .mockResolvedValueOnce(inventory())
        .mockResolvedValueOnce(inventory({ ownedIds: [], inspected: 2, listed: 2 })),
      pause: vi.fn(),
      schedulerCount: vi
        .fn()
        .mockResolvedValueOnce(9)
        .mockResolvedValueOnce(9)
        .mockResolvedValueOnce(9)
        .mockResolvedValue(7),
      writerQuiescence: vi.fn().mockResolvedValue(quiescence),
    };
    const result = await runOwnedScheduleRetirement({
      dryRun: false,
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      store,
    });
    expect(result.verdict).toBe("PASS");
    expect(result.schedulerCounts).toEqual({
      after: 7,
      baseline: 9,
      before: 9,
      expectedAfter: 7,
      retirementDelta: 2,
      samples: [7, 7, 7],
    });
    expect(result.checkpoint).toMatchObject({
      baselineSchedulerCount: 9,
      expectedFinalSchedulerCount: 7,
      expectedOwnedRetirementDelta: 2,
      version: 2,
    });
    expect(result.counts.remaining).toBe(0);
  });

  it("stabilizes a fresh scheduler baseline before retirement mutations", async () => {
    const store = {
      coverage: vi.fn().mockResolvedValue(coverage),
      delete: vi.fn(),
      inventory: vi
        .fn()
        .mockResolvedValueOnce(inventory())
        .mockResolvedValueOnce(inventory({ ownedIds: [], inspected: 2, listed: 2 })),
      pause: vi.fn(),
      schedulerCount: vi
        .fn()
        .mockResolvedValueOnce(9)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(10)
        .mockResolvedValue(8),
      writerQuiescence: vi.fn().mockResolvedValue(quiescence),
    };

    const result = await runOwnedScheduleRetirement({
      dryRun: false,
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 4 },
      store,
    });

    expect(result.verdict).toBe("PASS");
    expect(result.checkpoint).toMatchObject({
      baselineSchedulerCount: 10,
      expectedFinalSchedulerCount: 8,
    });
  });

  it("can pass a rerun after a previously recorded operation failure", async () => {
    const store = {
      coverage: vi.fn().mockResolvedValue(coverage),
      delete: vi.fn(),
      inventory: vi
        .fn()
        .mockResolvedValueOnce(inventory({ ownedIds: ["rank-check-k2"] }))
        .mockResolvedValueOnce(inventory({ ownedIds: [], inspected: 2, listed: 2 })),
      pause: vi.fn(),
      schedulerCount: vi
        .fn()
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(8)
        .mockResolvedValue(7),
      writerQuiescence: vi.fn().mockResolvedValue(quiescence),
    };
    const result = await runOwnedScheduleRetirement({
      dryRun: false,
      initialCheckpoint: {
        baselineOwnedIds: ["rank-check-k1", "rank-check-k2"],
        baselineSchedulerCount: 9,
        baselineUnrelatedHash: "stable-hash",
        expectedFinalSchedulerCount: 7,
        expectedOwnedRetirementDelta: 2,
        lastAttemptedIds: ["rank-check-k1"],
        totals: { alreadyAbsent: 0, attempted: 1, deleted: 1, failed: 1, paused: 1 },
        version: 2,
      },
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      store,
    });

    expect(result.verdict).toBe("PASS");
    expect(result.checkpoint.totals.failed).toBe(1);
  });

  it("resumes after a stale first scheduler count followed by three exact samples", async () => {
    const store = {
      coverage: vi.fn().mockResolvedValue(coverage),
      delete: vi.fn(),
      inventory: vi
        .fn()
        .mockResolvedValueOnce(inventory({ ownedIds: ["rank-check-k2"] }))
        .mockResolvedValueOnce(inventory({ ownedIds: [], inspected: 2, listed: 2 })),
      pause: vi.fn(),
      schedulerCount: vi
        .fn()
        .mockResolvedValueOnce(9)
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(8)
        .mockResolvedValue(7),
      writerQuiescence: vi.fn().mockResolvedValue(quiescence),
    };
    const result = await runOwnedScheduleRetirement({
      dryRun: false,
      initialCheckpoint: {
        baselineOwnedIds: ["rank-check-k1", "rank-check-k2"],
        baselineSchedulerCount: 9,
        baselineUnrelatedHash: "stable-hash",
        expectedFinalSchedulerCount: 7,
        expectedOwnedRetirementDelta: 2,
        lastAttemptedIds: ["rank-check-k1"],
        totals: { alreadyAbsent: 0, attempted: 1, deleted: 1, failed: 0, paused: 1 },
        version: 2,
      },
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 4 },
      store,
    });

    expect(result.verdict).toBe("PASS");
    expect(result.schedulerCounts.samples).toEqual([7, 7, 7]);
  });

  it("returns incomplete when bounded scheduler visibility shows loss or duplication", async () => {
    const store = {
      coverage: vi.fn().mockResolvedValue(coverage),
      delete: vi.fn(),
      inventory: vi
        .fn()
        .mockResolvedValueOnce(inventory())
        .mockResolvedValueOnce(inventory({ ownedIds: [], inspected: 2, listed: 2 })),
      pause: vi.fn(),
      schedulerCount: vi
        .fn()
        .mockResolvedValueOnce(9)
        .mockResolvedValueOnce(9)
        .mockResolvedValueOnce(9)
        .mockResolvedValueOnce(999)
        .mockResolvedValueOnce(999)
        .mockResolvedValueOnce(999),
      writerQuiescence: vi.fn().mockResolvedValue(quiescence),
    };
    const result = await runOwnedScheduleRetirement({
      dryRun: false,
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      store,
    });

    expect(result.verdict).toBe("FAIL");
    expect(result.hardGateReasons).toContain("scheduler-count-visibility-not-converged");
    expect(result.schedulerCounts.samples).toEqual([999, 999, 999]);
  });

  it("refuses pause and delete when writer quiescence is incomplete", async () => {
    const store = {
      coverage: vi.fn().mockResolvedValue(coverage),
      delete: vi.fn(),
      inventory: vi.fn().mockResolvedValue(inventory()),
      pause: vi.fn(),
      schedulerCount: vi.fn().mockResolvedValue(4),
      writerQuiescence: vi.fn().mockResolvedValue({
        evidence: {} as never,
        ready: false,
        reasons: ["effective-mode", "operation-lease-not-held"],
      }),
    };

    const result = await runOwnedScheduleRetirement({
      dryRun: false,
      pageSize: 10,
      schedulerVisibility: { intervalMs: 0, maxAttempts: 3 },
      store,
    });

    expect(result.verdict).toBe("FAIL");
    expect(result.hardGateReasons).toEqual(
      expect.arrayContaining(["effective-mode", "operation-lease-not-held"]),
    );
    expect(store.pause).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });
});
