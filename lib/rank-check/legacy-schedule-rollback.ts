import type { DispatcherStateCoverage } from "./dispatcher-state-coverage";
import {
  createLegacyRollbackCheckpoint,
  type LegacyRollbackCheckpoint,
  type LegacyRollbackCheckpointInput,
  type LegacyRollbackInventory,
  recordLegacyRollbackStatus,
  recoverLegacyRollbackPending,
} from "./legacy-rollback-checkpoint";
import type { ScheduleWriterQuiescenceEvaluation } from "./schedule-writer-quiescence";
import {
  waitForExactSchedulerCount,
  waitForStableSchedulerCount,
} from "./scheduler-count-convergence";
import { rankCheckScheduleId, type SyncRankCheckScheduleInput } from "./temporal-schedule";

export type {
  LegacyRollbackCheckpoint,
  LegacyRollbackCheckpointInput,
  LegacyRollbackPhase,
} from "./legacy-rollback-checkpoint";

export type LegacyRollbackStore = {
  coverage(): Promise<DispatcherStateCoverage>;
  ensurePaused(input: SyncRankCheckScheduleInput): Promise<unknown>;
  inventory(): Promise<LegacyRollbackInventory>;
  preflight(): Promise<{ claimsStopped: boolean; paidInFlightSafe: boolean }>;
  readPage(
    cursor: string | null,
    pageSize: number,
  ): Promise<{
    cursor: string | null;
    done: boolean;
    rows: SyncRankCheckScheduleInput[];
  }>;
  schedulerCount(): Promise<number>;
  verify(): Promise<{ exact: boolean; missing: number; unexpected: number }>;
  writerQuiescence(): Promise<ScheduleWriterQuiescenceEvaluation>;
};

export async function runLegacyScheduleRollback(options: {
  dryRun: boolean;
  initialCheckpoint?: LegacyRollbackCheckpointInput;
  onCheckpoint?: (checkpoint: LegacyRollbackCheckpoint) => Promise<void>;
  pageSize: number;
  schedulerVisibility?: { intervalMs: number; maxAttempts: number };
  stopAfterBatch?: boolean;
  store: LegacyRollbackStore;
}) {
  const [coverage, preflight, initialInventory, writerQuiescence] = await Promise.all([
    options.store.coverage(),
    options.store.preflight(),
    options.store.inventory(),
    options.store.writerQuiescence(),
  ]);
  const requiresStableBaseline =
    !options.initialCheckpoint || options.initialCheckpoint.version === 1;
  const baselineConvergence = requiresStableBaseline
    ? await waitForStableSchedulerCount({
        intervalMs: options.schedulerVisibility?.intervalMs,
        maxAttempts: options.schedulerVisibility?.maxAttempts,
        read: options.store.schedulerCount,
      })
    : null;
  const firstSchedulerCount = baselineConvergence?.count ?? (await options.store.schedulerCount());
  let before = initialInventory;
  const state = createLegacyRollbackCheckpoint(
    before.unrelatedHash,
    firstSchedulerCount,
    options.initialCheckpoint,
  );
  before = await recoverLegacyRollbackPending(
    state,
    before,
    {
      intervalMs: options.schedulerVisibility?.intervalMs,
      maxAttempts: options.schedulerVisibility?.maxAttempts,
      read: options.store.inventory,
    },
    options.onCheckpoint,
  );
  const expectedBefore = state.baselineSchedulerCount + state.totals.created;
  const schedulerConvergence = baselineConvergence
    ? baselineConvergence
    : options.initialCheckpoint
      ? await waitForExactSchedulerCount({
          expected: expectedBefore,
          intervalMs: options.schedulerVisibility?.intervalMs,
          maxAttempts: options.schedulerVisibility?.maxAttempts,
          read: options.store.schedulerCount,
        })
      : {
          converged: firstSchedulerCount === expectedBefore,
          count: firstSchedulerCount,
          samples: [firstSchedulerCount],
          stable: true,
        };
  const schedulerBefore = schedulerConvergence.count;
  const reasons = [...writerQuiescence.reasons];
  if (!coverage.exact) reasons.push("dispatcher-state-coverage-not-exact");
  if (!preflight.claimsStopped) reasons.push("dispatcher-claims-not-stopped");
  if (!preflight.paidInFlightSafe) reasons.push("paid-in-flight-not-safe");
  if ((before.ambiguousIds?.length ?? 0) > 0) reasons.push("ambiguous-rank-check-schedules");
  if (state.baselineUnrelatedHash !== before.unrelatedHash) {
    reasons.push("unrelated-schedule-set-changed");
  }
  if (!schedulerConvergence.converged) reasons.push("global-scheduler-conservation");
  const result = (verdict: "FAIL" | "INCOMPLETE" | "PASS", hardGateReasons: string[]) => ({
    checkpoint: state,
    coverage,
    hardGateReasons,
    preflight,
    schedulerCounts: {
      baseline: state.baselineSchedulerCount,
      before: schedulerBefore,
      expectedFinal: state.baselineSchedulerCount + state.totals.created,
      initialSamples: schedulerConvergence.samples,
    },
    unrelatedBefore: before,
    verdict,
    writerQuiescence,
  });
  if (reasons.length > 0) {
    const onlyUnstableVisibility =
      reasons.length === 1 &&
      reasons[0] === "global-scheduler-conservation" &&
      !schedulerConvergence.stable;
    return result(onlyUnstableVisibility ? "INCOMPLETE" : "FAIL", reasons);
  }

  while (state.phase !== "done") {
    const page = await options.store.readPage(state.cursor, options.pageSize);
    let conflict = false;
    if (!options.dryRun) {
      const completed = new Set(state.pageProgress.map((entry) => entry.scheduleId));
      for (const input of page.rows) {
        const scheduleId = rankCheckScheduleId(input.keywordId);
        if (completed.has(scheduleId)) continue;
        state.pending = {
          existedBefore: before.ownedIds.includes(scheduleId),
          scheduleId,
        };
        await options.onCheckpoint?.(structuredClone(state));
        try {
          const status = await options.store.ensurePaused(input);
          if (status !== "created" && status !== "exact" && status !== "updated") {
            throw new Error("Rollback Schedule mutation returned an invalid status.");
          }
          recordLegacyRollbackStatus(state, scheduleId, status);
          state.pending = null;
          await options.onCheckpoint?.(structuredClone(state));
        } catch {
          state.totals.failed += 1;
          await options.onCheckpoint?.(structuredClone(state));
          conflict = true;
          break;
        }
      }
    }
    if (conflict) return result("FAIL", ["rollback-schedule-conflict"]);
    state.cursor = page.cursor;
    state.totals.page += 1;
    state.totals.selected += page.rows.length;
    state.pageProgress = [];
    await options.onCheckpoint?.(structuredClone(state));
    if (options.stopAfterBatch && !page.done) {
      return result("INCOMPLETE", ["stopped-after-batch"]);
    }
    if (page.done) break;
  }

  if (options.dryRun) return result("PASS", []);
  const [verification, after] = await Promise.all([
    options.store.verify(),
    options.store.inventory(),
  ]);
  const finalReasons: string[] = [];
  if (!verification.exact || verification.missing > 0 || verification.unexpected > 0) {
    finalReasons.push("legacy-schedule-coverage-not-exact");
  }
  if (after.unrelatedHash !== state.baselineUnrelatedHash) {
    finalReasons.push("unrelated-schedule-set-changed");
  }
  if ((after.ambiguousIds?.length ?? 0) > 0) {
    finalReasons.push("ambiguous-rank-check-schedules");
  }
  const finalConvergence = await waitForExactSchedulerCount({
    expected: state.baselineSchedulerCount + state.totals.created,
    intervalMs: options.schedulerVisibility?.intervalMs,
    maxAttempts: options.schedulerVisibility?.maxAttempts,
    read: options.store.schedulerCount,
  });
  if (!finalConvergence.converged) finalReasons.push("global-scheduler-conservation");
  const reconciliationRequired =
    verification.missing > 0 &&
    verification.unexpected === 0 &&
    finalReasons.every((reason) => reason === "legacy-schedule-coverage-not-exact");
  if (reconciliationRequired) {
    state.cursor = null;
    state.pageProgress = [];
    state.phase = "reconcile";
    await options.onCheckpoint?.(structuredClone(state));
    return {
      ...result("INCOMPLETE", ["legacy-schedule-reconciliation-required"]),
      schedulerCounts: {
        ...result("PASS", []).schedulerCounts,
        observedFinal: finalConvergence.count,
        samples: finalConvergence.samples,
      },
      unrelatedAfter: after,
      verification,
    };
  }
  if (finalReasons.length === 0) state.phase = "done";
  await options.onCheckpoint?.(structuredClone(state));
  return {
    ...result(finalReasons.length === 0 ? "PASS" : "FAIL", finalReasons),
    schedulerCounts: {
      ...result("PASS", []).schedulerCounts,
      observedFinal: finalConvergence.count,
      samples: finalConvergence.samples,
    },
    unrelatedAfter: after,
    verification,
  };
}
