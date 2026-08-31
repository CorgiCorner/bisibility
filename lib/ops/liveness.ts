import {
  appliedMigrationSummary,
  bundledMigrationSummary,
  compareMigrationState,
  type MigrationComparison,
} from "@/lib/db/migration-state";
import { getBakedAppRevision } from "@/lib/deployment/runtime-env.generated";
import {
  type RankCheckSchedulerMode,
  rankCheckSchedulerMode,
} from "@/lib/rank-check/scheduler-mode";
import { getRedisClient } from "@/lib/redis/redis";
import { type ResolvedSchedulerDriver, schedulerDriver } from "@/lib/scheduler/driver";
import { temporalDeploymentConfig } from "@/lib/temporal/deployment-config";
import type { WorkerTemporalIdentity } from "./worker-temporal-identity";

export const WORKER_LAST_SEEN_KEY = "ops:worker:lastSeen";
export const WORKER_LIVENESS_REFRESH_MS = 5 * 60 * 1000;
// Keep the stale threshold derived so it scales with the worker refresh interval.
export const WORKER_STALE_AFTER_MS = 3 * WORKER_LIVENESS_REFRESH_MS;

export type WorkerHeartbeatState = "absent" | "fresh" | "future" | "invalid" | "stale";
export type WorkerLivenessStatus = "ok" | "stale" | "unknown";

export type WorkerLiveness = WorkerTemporalIdentity & {
  appliedMigration: string | null;
  bundledMigration: string | null;
  environment: string;
  heartbeatAgeMs: number | null;
  heartbeatState: WorkerHeartbeatState;
  lastSeenAt: string | null;
  release: string;
  revision: string;
  schedulerDriver: ResolvedSchedulerDriver | "unknown";
  schedulerMode: RankCheckSchedulerMode | "unknown";
  schemaComparison: MigrationComparison;
  status: WorkerLivenessStatus;
};

type WorkerLivenessRecord = WorkerTemporalIdentity & {
  appliedMigration: string | null;
  bundledMigration: string | null;
  environment: string;
  lastSeenAt: string;
  release: string;
  revision: string;
  schedulerDriver: ResolvedSchedulerDriver | "unknown";
  schedulerMode: RankCheckSchedulerMode | "unknown";
  schemaComparison: MigrationComparison;
};

function workerEnvironment() {
  return (
    process.env.DEPLOYMENT_ENV?.trim() ||
    process.env.BISIBILITY_ENV?.trim() ||
    process.env.NODE_ENV?.trim() ||
    "unknown"
  );
}

function workerRelease() {
  return process.env.APP_VERSION?.trim() || process.env.SENTRY_RELEASE?.trim() || "unknown";
}

function unknownLiveness(): WorkerLiveness {
  return {
    alertDeliveryTaskQueue: null,
    appliedMigration: null,
    bundledMigration: null,
    environment: "unknown",
    heartbeatAgeMs: null,
    heartbeatState: "absent",
    lastSeenAt: null,
    namespace: null,
    release: "unknown",
    revision: "unknown",
    schedulerDriver: "unknown",
    schedulerMode: "unknown",
    schemaComparison: "unknown",
    status: "unknown",
    taskQueue: null,
  };
}

function migrationComparison(value: unknown): MigrationComparison {
  return value === "ok" || value === "worker-ahead" || value === "worker-behind"
    ? value
    : "unknown";
}

function parseLivenessRecord(raw: string): WorkerLivenessRecord | null {
  try {
    const value = JSON.parse(raw) as Partial<WorkerLivenessRecord>;
    if (typeof value.lastSeenAt !== "string" || !Number.isFinite(Date.parse(value.lastSeenAt))) {
      return null;
    }
    return {
      alertDeliveryTaskQueue:
        typeof value.alertDeliveryTaskQueue === "string" ? value.alertDeliveryTaskQueue : null,
      appliedMigration: typeof value.appliedMigration === "string" ? value.appliedMigration : null,
      bundledMigration: typeof value.bundledMigration === "string" ? value.bundledMigration : null,
      environment: typeof value.environment === "string" ? value.environment : "unknown",
      lastSeenAt: value.lastSeenAt,
      namespace: typeof value.namespace === "string" ? value.namespace : null,
      release: typeof value.release === "string" ? value.release : "unknown",
      revision: typeof value.revision === "string" ? value.revision : "unknown",
      schedulerDriver:
        value.schedulerDriver === "temporal" ||
        value.schedulerDriver === "none" ||
        value.schedulerDriver === "legacy-auto"
          ? value.schedulerDriver
          : "unknown",
      schedulerMode:
        value.schedulerMode === "legacy" ||
        value.schedulerMode === "cutover" ||
        value.schedulerMode === "dispatcher"
          ? value.schedulerMode
          : "unknown",
      schemaComparison: migrationComparison(value.schemaComparison),
      taskQueue: typeof value.taskQueue === "string" ? value.taskQueue : null,
    };
  } catch {
    // Releases before the admin panel stored a bare ISO timestamp.
    return Number.isFinite(Date.parse(raw))
      ? {
          alertDeliveryTaskQueue: null,
          appliedMigration: null,
          bundledMigration: null,
          environment: "unknown",
          lastSeenAt: raw,
          namespace: null,
          release: "unknown",
          revision: "unknown",
          schedulerDriver: "unknown",
          schedulerMode: "unknown",
          schemaComparison: "unknown",
          taskQueue: null,
        }
      : null;
  }
}

async function currentWorkerMigrationState() {
  try {
    const bundled = bundledMigrationSummary();
    const applied = await appliedMigrationSummary();
    return {
      appliedMigration: applied.latest,
      bundledMigration: bundled.latest,
      schemaComparison: compareMigrationState({
        applied: applied.latest,
        bundled: bundled.latest,
      }),
    };
  } catch {
    return {
      appliedMigration: null,
      bundledMigration: null,
      schemaComparison: "unknown" as const,
    };
  }
}

/** Best-effort heartbeat. Worker startup and the daily ops activity call this. */
export async function refreshWorkerLiveness(now = new Date()): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) return;
    const migrationState = await currentWorkerMigrationState();
    const { alertDeliveryTaskQueue, namespace, taskQueue } = temporalDeploymentConfig();
    await redis.set(
      WORKER_LAST_SEEN_KEY,
      JSON.stringify({
        ...migrationState,
        alertDeliveryTaskQueue,
        environment: workerEnvironment(),
        lastSeenAt: now.toISOString(),
        namespace,
        release: workerRelease(),
        revision: getBakedAppRevision(),
        schedulerDriver: schedulerDriver(),
        schedulerMode: rankCheckSchedulerMode(),
        taskQueue,
      } satisfies WorkerLivenessRecord),
    );
  } catch (error) {
    console.error("[ops] worker liveness refresh failed", { error });
  }
}

/** Redis is optional, so unavailable or absent state is reported as unknown. */
export async function getWorkerLiveness(now = new Date()): Promise<WorkerLivenessStatus> {
  return (await getWorkerLivenessDetails(now)).status;
}

/** Return the persisted timestamp for operator diagnostics without coupling it to Slack. */
export async function getWorkerLivenessDetails(now = new Date()): Promise<WorkerLiveness> {
  try {
    const redis = await getRedisClient();
    if (!redis) return unknownLiveness();
    const raw = await redis.get(WORKER_LAST_SEEN_KEY);
    if (!raw) return unknownLiveness();
    const record = parseLivenessRecord(raw);
    if (!record) return { ...unknownLiveness(), heartbeatState: "invalid" };
    const lastSeen = Date.parse(record.lastSeenAt);
    const heartbeatAgeMs = now.getTime() - lastSeen;
    const heartbeatState: WorkerHeartbeatState =
      !Number.isFinite(heartbeatAgeMs) || heartbeatAgeMs < 0
        ? "future"
        : heartbeatAgeMs > WORKER_STALE_AFTER_MS
          ? "stale"
          : "fresh";
    return {
      alertDeliveryTaskQueue: record.alertDeliveryTaskQueue,
      appliedMigration: record.appliedMigration,
      bundledMigration: record.bundledMigration,
      environment: record.environment,
      heartbeatAgeMs,
      heartbeatState,
      lastSeenAt: new Date(lastSeen).toISOString(),
      namespace: record.namespace,
      release: record.release,
      revision: record.revision,
      schedulerDriver: record.schedulerDriver,
      schedulerMode: record.schedulerMode,
      schemaComparison: record.schemaComparison,
      status: heartbeatState === "fresh" ? "ok" : heartbeatState === "stale" ? "stale" : "unknown",
      taskQueue: record.taskQueue,
    };
  } catch {
    return unknownLiveness();
  }
}
