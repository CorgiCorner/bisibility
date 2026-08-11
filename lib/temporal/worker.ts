import { hostname } from "node:os";
import { fileURLToPath } from "node:url";
import { NativeConnection, Worker } from "@temporalio/worker";
import { assertMigrationsReady } from "../data-migrations/readiness";
import {
  appliedMigrationSummary,
  bundledMigrationSummary,
  compareMigrationState,
} from "../db/migration-state";
import { warnDeprecatedInspectionDailyBudget } from "../deployment/deprecated-inspection-budget";
import { collectTemporalHeartbeat } from "../ops/heartbeat-temporal";
import { refreshWorkerLiveness, WORKER_LIVENESS_REFRESH_MS } from "../ops/liveness";
import { notifyOps } from "../ops/notify";
import { publishTemporalSnapshot } from "../ops/temporal-snapshot";
import { RANK_CHECK_DISPATCHER_SCHEDULE_ID } from "../rank-check/dispatcher-constants";
import { rankCheckSchedulerMode } from "../rank-check/scheduler-mode";
import { assertTemporalSchedulerEnabled, schedulerDriver } from "../scheduler/driver";
import * as activities from "./activities";
import { ensureAlertDeliverySweepSchedule } from "./alert-delivery-bootstrap";
import { ALERT_DELIVERY_TASK_QUEUE } from "./alert-delivery-client";
import {
  deleteRetiredJobProcessorSchedule,
  ensureTrafficSyncSchedule,
  RECONCILER_SCHEDULE_ID,
} from "./bootstrap";
import {
  temporalConnectionOptions,
  temporalSdkConnectionOptions,
  temporalWebUiUrl,
} from "./connection-options";
import { temporalDeploymentConfig } from "./deployment-config";
import {
  ensureAlertDigestFlushSchedule,
  ensureAlertHealthSchedule,
  ensureAuditPurgeSchedule,
  ensureMigrationHoldReleaseSchedule,
  ensurePresenceSyncSchedule,
  ensureQueuedRankCheckRetentionSchedule,
  ensureRankCheckRawPurgeSchedule,
  ensureSessionPurgeSchedule,
  ensureSitemapSyncSchedule,
  ensureStaleChecksSchedule,
  ensureStaleImportJobsSchedule,
  ensureWeeklyDigestSchedule,
} from "./maintenance-schedule-bootstrap";
import { ensureOpsHeartbeatSchedule } from "./ops-bootstrap";
import { convergeRankCheckSchedulerSingletons } from "./rank-check-scheduler-convergence";
import { ensureRankCheckSearchAttributes } from "./search-attribute-bootstrap";
import { probeTemporalTransport } from "./transport-probe";
import { maxConcurrentActivities } from "./worker-config";
import { decideWorkerSchemaGuard, workerSchemaGuardMode } from "./worker-schema-guard";
import { runWorkerStartupStage } from "./worker-startup-retry";

// Worker uses the TS transform and resolve hook because parameter properties reject strip-only mode:
//
//   node --experimental-transform-types \
//     --import ./lib/temporal/register-loader.mjs lib/temporal/worker.ts
// `npm run temporal:worker` wires this up. Load env first, e.g.
//   set -a; . ./.env.local; set +a; npm run temporal:worker

const connectionOptions = temporalConnectionOptions();
const address = connectionOptions.address;
const deploymentConfig = temporalDeploymentConfig();
const namespace = deploymentConfig.namespace;
const taskQueue = deploymentConfig.taskQueue;
const deliveryTaskQueue = ALERT_DELIVERY_TASK_QUEUE;
const smokeMode = process.env.TEMPORAL_WORKER_SMOKE === "1";
const release = process.env.APP_VERSION?.trim() || "unknown";
const schedulerMode = rankCheckSchedulerMode();
const schedulerDriverValue = schedulerDriver();
const workerIdentity = `bisibility-worker/${release}/${process.pid}@${hostname()}`;

type WorkerScheduleResult = { scheduleId: string; status: string };

async function safeOpsHeartbeatBootstrap(): Promise<WorkerScheduleResult> {
  try {
    return await ensureOpsHeartbeatSchedule();
  } catch {
    console.error("[temporal] ops heartbeat schedule bootstrap failed");
    return { scheduleId: "ops-heartbeat", status: "failed" };
  }
}

async function enforceWorkerSchemaGuard() {
  const mode = workerSchemaGuardMode(process.env.WORKER_SCHEMA_GUARD);
  if (!decideWorkerSchemaGuard(mode, "unknown").check) return;

  const bundled = bundledMigrationSummary();
  const applied = await appliedMigrationSummary();
  const comparison = compareMigrationState({
    applied: applied.latest,
    bundled: bundled.latest,
  });
  const decision = decideWorkerSchemaGuard(mode, comparison);
  const details = {
    appliedLatest: applied.latest,
    bundledLatest: bundled.latest,
    comparison,
    mode,
    namespace,
    release,
    taskQueues: [taskQueue, deliveryTaskQueue],
  };
  if (decision.logLevel === "error") console.error("[temporal] worker schema guard", details);
  else if (decision.logLevel === "warning") console.warn("[temporal] worker schema guard", details);
  else console.info("[temporal] worker schema guard", details);

  if (decision.notify) {
    await notifyOps({
      fields: {
        "Applied migration": applied.latest ?? "unknown",
        "Bundled migration": bundled.latest ?? "unknown",
        Release: release,
      },
      kind: "worker_schema_drift",
      severity: comparison === "worker-behind" ? "error" : "warning",
      title: `Worker schema drift - ${comparison}`,
    }).catch(() => console.error("[ops] worker schema notification failed"));
  }

  if (decision.block) {
    throw new Error(
      "Worker schema guard blocked startup because the worker is behind the database.",
    );
  }
}

async function reportWorkerStartup(schedules: WorkerScheduleResult[]) {
  const failed = schedules.filter((schedule) => schedule.status === "failed");
  for (const schedule of failed) {
    await notifyOps({
      fields: { "Schedule ID": schedule.scheduleId, Status: schedule.status },
      kind: "schedule_bootstrap",
      severity: "error",
      title: "Temporal schedule bootstrap failed",
    }).catch(() => console.error("[ops] schedule bootstrap notification failed"));
  }

  const ensured = schedules.filter(
    (schedule) =>
      schedule.status === "created" ||
      schedule.status === "exists" ||
      schedule.status === "updated",
  ).length;
  await refreshWorkerLiveness().catch(() => console.error("[ops] liveness refresh failed"));
  await publishTemporalSnapshot(new Date(), collectTemporalHeartbeat);
  await notifyOps({
    fields: {
      "Failed schedules": failed.length,
      Namespace: namespace,
      "Rank-check scheduler mode": schedulerMode,
      "Scheduler driver": schedulerDriverValue,
      "Task queues": `${taskQueue}, ${deliveryTaskQueue}`,
    },
    kind: "worker_started",
    severity: "info",
    title: `Worker started - ${ensured} schedules ensured`,
  }).catch(() => console.error("[ops] worker startup notification failed"));
}

async function run() {
  warnDeprecatedInspectionDailyBudget();
  assertTemporalSchedulerEnabled();
  console.error("[temporal] worker startup config", {
    address,
    namespace,
    rank_check_scheduler_mode: schedulerMode,
    scheduler_driver: schedulerDriverValue,
    task_queues: [taskQueue, deliveryTaskQueue],
    tls: connectionOptions.tls ?? false,
    tls_source: connectionOptions.tlsSource,
  });
  await runWorkerStartupStage("app-database-migrations", async () => {
    await assertMigrationsReady();
    await enforceWorkerSchemaGuard();
  });
  await runWorkerStartupStage("transport", () => probeTemporalTransport(address));
  const connection = await runWorkerStartupStage("tls-auth", () =>
    NativeConnection.connect(temporalSdkConnectionOptions(connectionOptions)),
  );

  try {
    await runWorkerStartupStage("persistence-schema", () =>
      connection.workflowService.getSystemInfo({}),
    );
    await runWorkerStartupStage("namespace-cache", () =>
      connection.workflowService.describeNamespace({ namespace }),
    );
    const searchAttributes = await runWorkerStartupStage("search-attributes-bootstrap", () =>
      ensureRankCheckSearchAttributes(connection, { address, namespace }),
    );
    console.error("[temporal] rank-check search attributes", searchAttributes);
    const worker = await Worker.create({
      activities,
      connection,
      identity: workerIdentity,
      maxConcurrentActivityTaskExecutions: maxConcurrentActivities(),
      namespace,
      taskQueue,
      // Temporal bundles this file into the deterministic workflow sandbox.
      workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
    });
    const deliveryWorker = await Worker.create({
      activities,
      connection,
      identity: workerIdentity,
      maxConcurrentActivityTaskExecutions: maxConcurrentActivities(),
      namespace,
      taskQueue: deliveryTaskQueue,
      workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
    });

    // Rank-check scheduler convergence is a startup gate. Retire the
    // non-selected singleton before ensuring the selected owner.
    const schedules = await runWorkerStartupStage("schedule-bootstrap", async () => {
      const rankCheckSchedulers = await convergeRankCheckSchedulerSingletons();
      const ensured = await Promise.all([
        deleteRetiredJobProcessorSchedule(),
        ensureAlertDeliverySweepSchedule(),
        ensureAuditPurgeSchedule(),
        ensureRankCheckRawPurgeSchedule(),
        ensureQueuedRankCheckRetentionSchedule(),
        ensureAlertDigestFlushSchedule(),
        ensureAlertHealthSchedule(),
        ensureSessionPurgeSchedule(),
        ensureStaleChecksSchedule(),
        ensureStaleImportJobsSchedule(),
        ensureMigrationHoldReleaseSchedule(),
        ensureWeeklyDigestSchedule(),
        ensureTrafficSyncSchedule(),
        ensureSitemapSyncSchedule(),
        ensurePresenceSyncSchedule(),
        safeOpsHeartbeatBootstrap(),
      ]);
      ensured.push(
        {
          scheduleId: RECONCILER_SCHEDULE_ID,
          status: rankCheckSchedulers.reconciler,
        },
        {
          scheduleId: RANK_CHECK_DISPATCHER_SCHEDULE_ID,
          status: rankCheckSchedulers.dispatcher,
        },
      );
      return ensured;
    });
    for (const schedule of schedules) {
      console.error("[temporal] schedule status", {
        scheduleId: schedule.scheduleId,
        status: schedule.status,
      });
    }

    await reportWorkerStartup(schedules);

    console.error("[temporal] worker ready", {
      address,
      identity: workerIdentity,
      namespace,
      rank_check_scheduler_mode: schedulerMode,
      scheduler_driver: schedulerDriverValue,
      task_queues: [taskQueue, deliveryTaskQueue],
    });
    const webUiUrl = temporalWebUiUrl(connectionOptions);
    if (webUiUrl) {
      console.error(`[temporal] Web UI: ${webUiUrl}`);
    }
    const livenessTimer = setInterval(() => {
      void refreshWorkerLiveness().catch(() =>
        console.error("[ops] periodic liveness refresh failed"),
      );
      void publishTemporalSnapshot(new Date(), collectTemporalHeartbeat);
    }, WORKER_LIVENESS_REFRESH_MS);
    livenessTimer.unref();
    try {
      await Promise.all([worker.run(), deliveryWorker.run()]);
    } finally {
      clearInterval(livenessTimer);
    }
  } finally {
    // Swallow close failures so `finally` cannot replace the original startup error;
    // report them separately.
    try {
      await connection.close();
    } catch (closeError) {
      console.error("[temporal] connection close failed:", closeError);
    }
  }
}

// The offline smoke test imports this entry to validate the graph without
// connecting to Temporal.
if (!smokeMode) {
  try {
    await run();
  } catch (error) {
    console.error("[temporal] worker failed:", error);
    process.exit(1);
  }
}
