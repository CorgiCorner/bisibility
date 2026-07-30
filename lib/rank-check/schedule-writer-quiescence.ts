import type { WorkerHeartbeatState } from "@/lib/ops/liveness";
import type { RankCheckSchedulerMode } from "./scheduler-mode";

export type ScheduleWriterQuiescenceEvidence = {
  appEnvironment: string;
  appMigrationReady: boolean;
  appMode: RankCheckSchedulerMode;
  appRelease: string;
  credentialsExclusive: boolean;
  dispatcherRetired: boolean;
  inventoryAmbiguousCandidates: number;
  inventoryInspectionFailures: number;
  localMigrationReady: boolean;
  operationLeaseHeld: boolean;
  reconcilerRetired: boolean;
  workerEnvironment: string;
  workerHeartbeatState: WorkerHeartbeatState;
  workerMode: RankCheckSchedulerMode | "unknown";
  workerRelease: string;
  workerSchemaReady: boolean;
};

export type ScheduleWriterQuiescenceEvaluation = {
  evidence: ScheduleWriterQuiescenceEvidence;
  ready: boolean;
  reasons: string[];
};

export function evaluateScheduleWriterQuiescence(
  evidence: ScheduleWriterQuiescenceEvidence,
): ScheduleWriterQuiescenceEvaluation {
  const reasons: string[] = [];
  if (
    evidence.appRelease === "unknown" ||
    evidence.workerRelease === "unknown" ||
    evidence.appRelease !== evidence.workerRelease
  ) {
    reasons.push("release-parity");
  }
  if (evidence.appMode !== "cutover" || evidence.workerMode !== "cutover") {
    reasons.push("effective-mode");
  }
  if (
    evidence.appEnvironment === "unknown" ||
    evidence.workerEnvironment === "unknown" ||
    evidence.appEnvironment !== evidence.workerEnvironment
  ) {
    reasons.push("worker-environment");
  }
  if (!evidence.appMigrationReady || !evidence.localMigrationReady) {
    reasons.push("migration-readiness");
  }
  if (!evidence.workerSchemaReady) reasons.push("worker-schema");
  if (evidence.workerHeartbeatState !== "fresh") {
    reasons.push(`worker-heartbeat-${evidence.workerHeartbeatState}`);
  }
  if (!evidence.reconcilerRetired) reasons.push("reconciler-not-retired");
  if (!evidence.dispatcherRetired) reasons.push("dispatcher-not-retired");
  if (evidence.inventoryInspectionFailures !== 0) reasons.push("schedule-inspection-failed");
  if (evidence.inventoryAmbiguousCandidates !== 0) {
    reasons.push("ambiguous-rank-check-schedules");
  }
  if (!evidence.operationLeaseHeld) reasons.push("operation-lease-not-held");
  if (!evidence.credentialsExclusive) reasons.push("temporal-credentials-not-exclusive");
  return { evidence, ready: reasons.length === 0, reasons };
}
