import type { RankCheckSchedulerMode } from "./scheduler-mode";

export type CutoverQuiescenceSnapshot = {
  activeResultRetrieval: number;
  appEnvironment: string;
  appMode: RankCheckSchedulerMode;
  appRelease: string;
  coverageExact: boolean;
  dispatcherRetired: boolean;
  dispatcherExecutions: number;
  dueLagMs?: number;
  duplicatePaidEvidence: number;
  inventoryAmbiguousCandidates: number;
  inventoryInspectionFailures: number;
  legacyStartsDuringObservation: number;
  legacyVisibilityComplete: boolean;
  legacyVisibilitySamples: number;
  migrationReady: boolean;
  observationSeconds: number;
  opsErrorEvents: number;
  ownedLegacySchedules: number;
  providerFailures: number;
  queuedAmbiguous: number;
  queuedPrepared: number;
  queuedReady?: number;
  queuedSubmitted: number;
  queuedSubmitting: number;
  rankCheckExecutions: number;
  reconcilerRetired: boolean;
  runningScheduledChecks: number;
  runningScheduledCanInitiatePaidCall: number;
  schedulerBaselineCount: number;
  schedulerExpectedFinalCount: number;
  schedulerExpectedRetirementDelta: number;
  schedulerVisibilityComplete: boolean;
  schedulerVisibilitySamples: number[];
  schedulerVisibilityStable: boolean;
  staleRunningChecks: number;
  taskQueueBacklog: number;
  totalSchedulerWorkflows: number;
  unrelatedSchedulesConserved: boolean;
  workerMode: RankCheckSchedulerMode | "unknown";
  workerEnvironment: string;
  workerHeartbeatState: "absent" | "fresh" | "future" | "invalid" | "stale";
  workerRelease: string;
  workerHeartbeatFresh: boolean;
  workerSchemaReady: boolean;
};

export const CUTOVER_QUIESCENCE_THRESHOLDS = {
  backlogBound: 25,
  dueLagBoundMs: 24 * 60 * 60 * 1_000,
  observationSeconds: 120,
  opsErrorEvents: 0,
  providerFailures: 0,
} as const;

export function evaluateCutoverQuiescence(
  snapshot: CutoverQuiescenceSnapshot,
  options: { backlogBound?: number; backlogExplanation?: string } = {},
) {
  const reasons: string[] = [];
  const backlogBound = options.backlogBound ?? CUTOVER_QUIESCENCE_THRESHOLDS.backlogBound;
  if (
    snapshot.appRelease === "unknown" ||
    snapshot.workerRelease === "unknown" ||
    snapshot.appRelease !== snapshot.workerRelease
  ) {
    reasons.push("release-parity");
  }
  if (snapshot.appMode !== "cutover" || snapshot.workerMode !== "cutover") {
    reasons.push("effective-mode");
  }
  if (
    snapshot.appEnvironment === "unknown" ||
    snapshot.workerEnvironment === "unknown" ||
    snapshot.appEnvironment !== snapshot.workerEnvironment
  ) {
    reasons.push("worker-environment");
  }
  if (!snapshot.migrationReady || !snapshot.workerSchemaReady) reasons.push("migration-readiness");
  if (!snapshot.coverageExact) reasons.push("dispatcher-state-coverage");
  if (snapshot.inventoryInspectionFailures !== 0) reasons.push("schedule-inspection-failed");
  if (snapshot.inventoryAmbiguousCandidates !== 0) {
    reasons.push("ambiguous-rank-check-schedules");
  }
  if (!snapshot.dispatcherRetired) reasons.push("dispatcher-singleton-retirement");
  if (snapshot.ownedLegacySchedules !== 0) reasons.push("owned-legacy-schedules");
  if (!snapshot.reconcilerRetired) reasons.push("reconciler-retirement");
  if (!snapshot.unrelatedSchedulesConserved) reasons.push("unrelated-schedule-conservation");
  if (
    snapshot.schedulerExpectedRetirementDelta < 0 ||
    snapshot.schedulerBaselineCount - snapshot.schedulerExpectedRetirementDelta !==
      snapshot.schedulerExpectedFinalCount
  ) {
    reasons.push("global-scheduler-conservation");
  } else if (
    !snapshot.schedulerVisibilityComplete ||
    snapshot.schedulerVisibilitySamples.length < 3 ||
    !snapshot.schedulerVisibilitySamples
      .slice(-3)
      .every((count) => count === snapshot.schedulerExpectedFinalCount)
  ) {
    const stableMismatch =
      snapshot.schedulerVisibilityStable &&
      snapshot.schedulerVisibilitySamples.length >= 3 &&
      snapshot.totalSchedulerWorkflows !== snapshot.schedulerExpectedFinalCount;
    reasons.push(
      stableMismatch ? "global-scheduler-conservation" : "scheduler-visibility-incomplete",
    );
  } else if (snapshot.totalSchedulerWorkflows !== snapshot.schedulerExpectedFinalCount) {
    reasons.push("global-scheduler-conservation");
  }
  if (snapshot.observationSeconds < CUTOVER_QUIESCENCE_THRESHOLDS.observationSeconds) {
    reasons.push("observation-too-short");
  }
  if (snapshot.legacyStartsDuringObservation !== 0) reasons.push("new-legacy-starts");
  if (!snapshot.legacyVisibilityComplete || snapshot.legacyVisibilitySamples < 3) {
    reasons.push("legacy-visibility-incomplete");
  }
  if (snapshot.queuedPrepared + snapshot.queuedSubmitting !== 0) {
    reasons.push("unsubmitted-queued-batches");
  }
  if (snapshot.activeResultRetrieval !== 0) reasons.push("active-paid-result-retrieval");
  if (snapshot.runningScheduledCanInitiatePaidCall !== 0) {
    reasons.push("scheduled-paid-call-risk");
  }
  if (snapshot.rankCheckExecutions !== 0) reasons.push("rank-check-workflows-running");
  if (snapshot.dispatcherExecutions !== 0) reasons.push("dispatcher-workflows-running");
  if (snapshot.staleRunningChecks !== 0) reasons.push("stale-running-checks");
  if (snapshot.duplicatePaidEvidence !== 0) reasons.push("duplicate-paid-evidence");
  if (snapshot.providerFailures > CUTOVER_QUIESCENCE_THRESHOLDS.providerFailures) {
    reasons.push("provider-failures");
  }
  if (snapshot.opsErrorEvents > CUTOVER_QUIESCENCE_THRESHOLDS.opsErrorEvents) {
    reasons.push("ops-error-events");
  }
  if (!snapshot.workerHeartbeatFresh) {
    reasons.push(`worker-heartbeat-${snapshot.workerHeartbeatState}`);
  }
  if (
    snapshot.dueLagMs !== undefined &&
    snapshot.dueLagMs > CUTOVER_QUIESCENCE_THRESHOLDS.dueLagBoundMs
  ) {
    reasons.push("dispatcher-due-lag");
  }
  if (
    snapshot.taskQueueBacklog > backlogBound ||
    (snapshot.taskQueueBacklog > 0 && !options.backlogExplanation?.trim())
  ) {
    reasons.push("task-queue-backlog");
  }
  const incompleteReasons = new Set([
    "legacy-visibility-incomplete",
    "scheduler-visibility-incomplete",
  ]);
  const onlyIncompleteVisibility =
    reasons.length > 0 && reasons.every((reason) => incompleteReasons.has(reason));
  return {
    reasons,
    verdict:
      reasons.length === 0
        ? ("PASS" as const)
        : onlyIncompleteVisibility
          ? ("INCOMPLETE" as const)
          : ("FAIL" as const),
  };
}
