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
import { notifyOps } from "../ops/notify";
import { RANK_CHECK_DISPATCHER_SCHEDULE_ID } from "../rank-check/dispatcher-constants";
import { assertRankCheckRunsScheduleEnabled } from "../rank-check/run-maintenance-config";
import { rankCheckSchedulerMode } from "../rank-check/scheduler-mode";
import { assertTemporalSchedulerEnabled, schedulerDriver } from "../scheduler/driver";
import * as activities from "./activities";
import { ensureAlertDeliverySweepSchedule } from "./alert-delivery-bootstrap";
import { deleteRetiredJobProcessorSchedule, RECONCILER_SCHEDULE_ID } from "./bootstrap";
import { temporalConnectionOptions, temporalSdkConnectionOptions } from "./connection-options";
import { temporalDeploymentConfig } from "./deployment-config";
import {
  ensureAlertDigestFlushSchedule,
  ensureAlertHealthSchedule,
  ensureAuditPurgeSchedule,
  ensureMigrationHoldReleaseSchedule,
  ensurePresenceSyncSchedule,
  ensureQueuedRankCheckRetentionSchedule,
  ensureRankCheckRawPurgeSchedule,
  ensureRankCheckRunsSchedule,
  ensureSessionPurgeSchedule,
  ensureSitemapSyncSchedule,
  ensureStaleChecksSchedule,
  ensureStaleImportJobsSchedule,
  ensureWeeklyDigestSchedule,
} from "./maintenance-schedule-bootstrap";
import { convergeRankCheckSchedulerSingletons } from "./rank-check-scheduler-convergence";
import { ensureRankCheckSearchAttributes } from "./search-attribute-bootstrap";
// Imported directly, not through bootstrap.ts: search-insights-bootstrap.ts already depends on
// bootstrap.ts for the calendar helpers, so re-exporting it there would close an import cycle.
import { ensureSearchInsightsSyncSchedule } from "./search-insights-bootstrap";
import { ensureSearchInsightsQueueReconciliationSchedule } from "./search-insights-reconciliation-bootstrap";
import { deleteRetiredTrafficIntentSweepSchedule } from "./traffic-bootstrap";
import { ensureTrafficRuntimeSchedules } from "./traffic-runtime";
import { probeTemporalTransport } from "./transport-probe";
import { runWelcomeIntentRuntime } from "./welcome-intent-runtime";
import { maxConcurrentActivities } from "./worker-config";
import {
  decideWorkerSchemaGuard,
  workerSchemaDriftDedupeKey,
  workerSchemaGuardMode,
} from "./worker-schema-guard";
import { logWorkerStartupIdentity, workerStartupIdentity } from "./worker-startup-identity";
import { reportWorkerStartup, safeOpsHeartbeatBootstrap } from "./worker-startup-report";
import { runWorkerStartupStage } from "./worker-startup-retry";

// Worker uses the TS transform and resolve hook because parameter properties reject strip-only mode:
//
//   node --experimental-transform-types \
//     --import ./lib/temporal/register-loader.mjs lib/temporal/worker.ts
// `npm run temporal:worker` wires this up but does not load .env or .env.local itself.
// Load env first, e.g. set -a; . ./.env.local; set +a; npm run temporal:worker

const connectionOptions = temporalConnectionOptions();
const address = connectionOptions.address;
const deploymentConfig = temporalDeploymentConfig();
const startupIdentity = workerStartupIdentity(deploymentConfig);
const namespace = startupIdentity.namespace;
const taskQueue = startupIdentity.taskQueue;
const deliveryTaskQueue = startupIdentity.alertDeliveryTaskQueue;
const smokeMode = process.env.TEMPORAL_WORKER_SMOKE === "1";
const release = process.env.APP_VERSION?.trim() || "unknown";
const schedulerMode = rankCheckSchedulerMode();
const schedulerDriverValue = schedulerDriver();
const workerIdentity = `bisibility-worker/${release}/${process.pid}@${hostname()}`;

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
      dedupeKey: workerSchemaDriftDedupeKey({
        appliedLatest: applied.latest,
        bundledLatest: bundled.latest,
        comparison,
        release,
      }),
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
  logWorkerStartupIdentity(deploymentConfig);
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
    const rankCheckRunsDecision = await runWorkerStartupStage(
      "rank-check-runs-maintenance",
      async () => assertRankCheckRunsScheduleEnabled(schedulerMode),
    );
    const schedules = await runWorkerStartupStage("schedule-bootstrap", async () => {
      const rankCheckSchedulers = await convergeRankCheckSchedulerSingletons();
      const retiredTrafficIntentSweepSchedule = await deleteRetiredTrafficIntentSweepSchedule();
      const rankCheckRunsSchedule = ensureRankCheckRunsSchedule();
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
        ...ensureTrafficRuntimeSchedules(),
        ensureSearchInsightsSyncSchedule(),
        ensureSearchInsightsQueueReconciliationSchedule(),
        ensureSitemapSyncSchedule(),
        ensurePresenceSyncSchedule(),
        safeOpsHeartbeatBootstrap(),
      ]);
      ensured.push(await rankCheckRunsSchedule);
      ensured.push(
        retiredTrafficIntentSweepSchedule,
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
    const rankCheckRunsSchedule = schedules.find(
      (schedule) => schedule.scheduleId === "maintenance-rank-check-runs",
    );
    console.error("[temporal] rank-check runs schedule", {
      decision: rankCheckRunsDecision.reason,
      scheduleId: "maintenance-rank-check-runs",
      status: rankCheckRunsSchedule?.status ?? "failed",
    });

    await reportWorkerStartup({
      namespace,
      schedulerDriver: schedulerDriverValue,
      schedulerMode,
      schedules,
      taskQueues: [taskQueue, deliveryTaskQueue],
    });

    console.error("[temporal] worker ready", {
      address,
      identity: workerIdentity,
      namespace,
      rank_check_scheduler_mode: schedulerMode,
      scheduler_driver: schedulerDriverValue,
      task_queues: [taskQueue, deliveryTaskQueue],
    });
    await runWelcomeIntentRuntime({
      connectionOptions,
      deliveryWorker,
      worker,
    });
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
