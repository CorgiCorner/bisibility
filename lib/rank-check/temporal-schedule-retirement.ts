import type { DispatcherStateCoverage } from "./dispatcher-state-coverage";
import type { ScheduleWriterQuiescenceEvaluation } from "./schedule-writer-quiescence";
import {
  waitForExactSchedulerCount,
  waitForStableSchedulerCount,
} from "./scheduler-count-convergence";

export type RankCheckScheduleInventory = {
  ambiguousIds: string[];
  dispatcher: "absent" | "active" | "paused";
  failed: number;
  inspected: number;
  listed: number;
  ownedIds: string[];
  pausedOwnedIds: string[];
  reconciler: "absent" | "active" | "paused";
  unrelatedHash: string;
  unrelatedIds: string[];
};

export type ScheduleRetirementTotals = {
  alreadyAbsent: number;
  attempted: number;
  deleted: number;
  failed: number;
  paused: number;
};

export type ScheduleRetirementCheckpoint = {
  baselineOwnedIds: string[];
  baselineSchedulerCount: number;
  baselineUnrelatedHash: string;
  expectedFinalSchedulerCount: number;
  expectedOwnedRetirementDelta: number;
  lastAttemptedIds: string[];
  totals: ScheduleRetirementTotals;
  version: 2;
};

export type OwnedScheduleRetirementStore = {
  coverage(): Promise<DispatcherStateCoverage>;
  delete(scheduleId: string): Promise<unknown>;
  inventory(): Promise<RankCheckScheduleInventory>;
  pause(scheduleId: string): Promise<unknown>;
  schedulerCount(): Promise<number>;
  writerQuiescence(): Promise<ScheduleWriterQuiescenceEvaluation>;
};

const EMPTY_TOTALS: ScheduleRetirementTotals = {
  alreadyAbsent: 0,
  attempted: 0,
  deleted: 0,
  failed: 0,
  paused: 0,
};

function inventoryCounts(inventory: RankCheckScheduleInventory | null) {
  return inventory
    ? {
        ambiguous: inventory.ambiguousIds.length,
        dispatcher: inventory.dispatcher,
        failed: inventory.failed,
        inspected: inventory.inspected,
        listed: inventory.listed,
        owned: inventory.ownedIds.length,
        unrelated: inventory.unrelatedIds.length,
      }
    : null;
}

function checkpoint(
  inventory: RankCheckScheduleInventory,
  schedulerCount: number,
  initial?: ScheduleRetirementCheckpoint,
): ScheduleRetirementCheckpoint {
  if (initial) {
    if (initial.version !== 2) throw new Error("Unsupported retirement checkpoint version.");
    return structuredClone(initial);
  }
  const baselineOwnedIds = [...inventory.ownedIds].sort();
  return {
    baselineOwnedIds,
    baselineSchedulerCount: schedulerCount,
    baselineUnrelatedHash: inventory.unrelatedHash,
    expectedFinalSchedulerCount: schedulerCount - baselineOwnedIds.length,
    expectedOwnedRetirementDelta: baselineOwnedIds.length,
    lastAttemptedIds: [],
    totals: { ...EMPTY_TOTALS },
    version: 2,
  };
}

export async function runOwnedScheduleRetirement(options: {
  dryRun: boolean;
  initialCheckpoint?: ScheduleRetirementCheckpoint;
  onCheckpoint?: (checkpoint: ScheduleRetirementCheckpoint) => Promise<void>;
  pageSize: number;
  schedulerVisibility?: { intervalMs: number; maxAttempts: number };
  stopAfterBatch?: boolean;
  store: OwnedScheduleRetirementStore;
}) {
  const [coverage, before, writerQuiescence] = await Promise.all([
    options.store.coverage(),
    options.store.inventory(),
    options.store.writerQuiescence(),
  ]);
  const baselineConvergence = options.initialCheckpoint
    ? null
    : await waitForStableSchedulerCount({
        intervalMs: options.schedulerVisibility?.intervalMs,
        maxAttempts: options.schedulerVisibility?.maxAttempts,
        read: options.store.schedulerCount,
      });
  const firstSchedulerCount = baselineConvergence?.count ?? (await options.store.schedulerCount());
  const state = checkpoint(before, firstSchedulerCount, options.initialCheckpoint);
  const retiredBefore = state.baselineOwnedIds.filter((id) => !before.ownedIds.includes(id)).length;
  const expectedCurrentCount = state.baselineSchedulerCount - retiredBefore;
  const initialConvergence =
    baselineConvergence ??
    (await waitForExactSchedulerCount({
      expected: expectedCurrentCount,
      intervalMs: options.schedulerVisibility?.intervalMs,
      maxAttempts: options.schedulerVisibility?.maxAttempts,
      read: options.store.schedulerCount,
    }));
  const schedulerBefore = initialConvergence.count;
  const alreadyAbsentAtStart = state.totals.alreadyAbsent;
  const deletedAtStart = state.totals.deleted;
  const failedAtStart = state.totals.failed;
  const estimatedRemaining = () =>
    Math.max(
      0,
      before.ownedIds.length -
        (state.totals.deleted - deletedAtStart) -
        (state.totals.alreadyAbsent - alreadyAbsentAtStart),
    );
  const fail = (reasons: string[], verdict: "FAIL" | "INCOMPLETE" = "FAIL") => ({
    checkpoint: state,
    counts: {
      after: null,
      before: inventoryCounts(before),
      remaining: estimatedRemaining(),
    },
    coverage,
    hardGateReasons: reasons,
    inventoryAfter: null,
    inventoryBefore: before,
    schedulerCounts: {
      after: null,
      baseline: state.baselineSchedulerCount,
      before: schedulerBefore,
      expectedAfter: state.expectedFinalSchedulerCount,
      retirementDelta: state.expectedOwnedRetirementDelta,
      samples: initialConvergence.samples,
    },
    writerQuiescence,
    verdict,
  });

  const initialReasons: string[] = [];
  initialReasons.push(...writerQuiescence.reasons);
  if (!coverage.exact) initialReasons.push("dispatcher-state-coverage-not-exact");
  if (before.failed > 0) initialReasons.push("schedule-inspection-failed");
  if (before.ambiguousIds.length > 0) initialReasons.push("ambiguous-rank-check-schedules");
  if (before.dispatcher === "active") initialReasons.push("dispatcher-not-retired");
  if (before.reconciler === "active") initialReasons.push("reconciler-not-retired");
  if (state.baselineUnrelatedHash !== before.unrelatedHash) {
    initialReasons.push("unrelated-schedule-set-changed");
  }
  if (
    state.expectedOwnedRetirementDelta < 0 ||
    state.expectedOwnedRetirementDelta !== state.baselineOwnedIds.length ||
    state.expectedFinalSchedulerCount !==
      state.baselineSchedulerCount - state.expectedOwnedRetirementDelta
  ) {
    initialReasons.push("scheduler-conservation-equation-invalid");
  }
  if (before.ownedIds.some((id) => !state.baselineOwnedIds.includes(id))) {
    initialReasons.push("owned-schedule-set-changed");
  }
  if (!initialConvergence.converged) {
    initialReasons.push("scheduler-count-visibility-not-converged");
  }
  if (initialReasons.length > 0) {
    return fail(
      initialReasons,
      !initialConvergence.converged && !initialConvergence.stable ? "INCOMPLETE" : "FAIL",
    );
  }

  if (options.dryRun) {
    return {
      checkpoint: state,
      counts: {
        after: inventoryCounts(before),
        before: inventoryCounts(before),
        remaining: before.ownedIds.length,
      },
      coverage,
      hardGateReasons: [],
      inventoryAfter: before,
      inventoryBefore: before,
      schedulerCounts: {
        after: schedulerBefore,
        baseline: state.baselineSchedulerCount,
        before: schedulerBefore,
        expectedAfter: state.expectedFinalSchedulerCount,
        retirementDelta: state.expectedOwnedRetirementDelta,
        samples: initialConvergence.samples,
      },
      verdict: "PASS" as const,
      writerQuiescence,
    };
  }

  const ids = [...before.ownedIds].sort();
  for (let offset = 0; offset < ids.length; offset += options.pageSize) {
    const batch = ids.slice(offset, offset + options.pageSize);
    state.lastAttemptedIds = batch;
    for (const scheduleId of batch) {
      state.totals.attempted += 1;
      try {
        const pauseStatus = await options.store.pause(scheduleId);
        if (pauseStatus === "absent") {
          state.totals.alreadyAbsent += 1;
          continue;
        }
        state.totals.paused += 1;
        const deleteStatus = await options.store.delete(scheduleId);
        if (deleteStatus === "absent") state.totals.alreadyAbsent += 1;
        else state.totals.deleted += 1;
      } catch {
        state.totals.failed += 1;
      }
    }
    await options.onCheckpoint?.(structuredClone(state));
    if (options.stopAfterBatch && offset + options.pageSize < ids.length) {
      return fail(["stopped-after-batch"], "INCOMPLETE");
    }
  }

  const after = await options.store.inventory();
  const schedulerConvergence = await waitForExactSchedulerCount({
    expected: state.expectedFinalSchedulerCount,
    intervalMs: options.schedulerVisibility?.intervalMs,
    maxAttempts: options.schedulerVisibility?.maxAttempts,
    read: options.store.schedulerCount,
  });
  const schedulerAfter = schedulerConvergence.count;
  const expectedAfter = state.expectedFinalSchedulerCount;
  const reasons: string[] = [];
  if (state.totals.failed > failedAtStart) reasons.push("retirement-operation-failed");
  if (after.failed > 0) reasons.push("post-retirement-inspection-failed");
  if (after.ambiguousIds.length > 0) reasons.push("post-retirement-ambiguous-schedules");
  if (after.dispatcher === "active") reasons.push("dispatcher-not-retired");
  if (after.ownedIds.length > 0) reasons.push("owned-schedules-remain");
  if (after.reconciler === "active") reasons.push("reconciler-not-retired");
  if (after.unrelatedHash !== state.baselineUnrelatedHash) {
    reasons.push("unrelated-schedule-set-changed");
  }
  if (!schedulerConvergence.converged) {
    reasons.push("scheduler-count-visibility-not-converged");
  }
  await options.onCheckpoint?.(structuredClone(state));
  return {
    checkpoint: state,
    counts: {
      after: inventoryCounts(after),
      before: inventoryCounts(before),
      remaining: after.ownedIds.length,
    },
    coverage,
    hardGateReasons: reasons,
    inventoryAfter: after,
    inventoryBefore: before,
    schedulerCounts: {
      after: schedulerAfter,
      baseline: state.baselineSchedulerCount,
      before: schedulerBefore,
      expectedAfter,
      retirementDelta: state.expectedOwnedRetirementDelta,
      samples: schedulerConvergence.samples,
    },
    verdict:
      reasons.length === 0
        ? ("PASS" as const)
        : !schedulerConvergence.converged && schedulerConvergence.stable
          ? ("FAIL" as const)
          : ("INCOMPLETE" as const),
    writerQuiescence,
  };
}
