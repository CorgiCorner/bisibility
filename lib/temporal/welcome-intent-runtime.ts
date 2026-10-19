import { startRecoveryProcessor } from "../metering/recovery/processor";
import { collectTemporalHeartbeat } from "../ops/heartbeat-temporal";
import { refreshWorkerLiveness, WORKER_LIVENESS_REFRESH_MS } from "../ops/liveness";
import { publishTemporalSnapshot } from "../ops/temporal-snapshot";
import { monitorProviderUsageReconciliation } from "../provider-usage/reconciliation-monitor";
import { closeRedisClient } from "../redis/redis";
import { type TemporalConnectionOptions, temporalWebUiUrl } from "./connection-options";
import { isScheduledMaintenanceEnabled } from "./maintenance-schedule-bootstrap";
import { startWorkerExtensions } from "./worker-extensions";
import { startWorkerIntentProcessor } from "./worker-intent-processor";

type RunningWorker = { run: () => Promise<unknown> };

type WelcomeIntentRuntimeOptions = {
  connectionOptions: TemporalConnectionOptions;
  deliveryWorker: RunningWorker;
  worker: RunningWorker;
};

export async function runWelcomeIntentRuntime({
  connectionOptions,
  deliveryWorker,
  worker,
}: WelcomeIntentRuntimeOptions) {
  const webUiUrl = temporalWebUiUrl(connectionOptions);
  if (webUiUrl) {
    console.error(`[temporal] Web UI: ${webUiUrl}`);
  }

  const startedAt = new Date();
  let checkingUsage = false;
  const livenessTimer = setInterval(() => {
    void refreshWorkerLiveness().catch(() =>
      console.error("[ops] periodic liveness refresh failed"),
    );
    void publishTemporalSnapshot(new Date(), collectTemporalHeartbeat);
    if (!checkingUsage && isScheduledMaintenanceEnabled()) {
      checkingUsage = true;
      void monitorProviderUsageReconciliation(startedAt)
        .catch(() => console.error("[ops] provider usage freshness check failed"))
        .finally(() => {
          checkingUsage = false;
        });
    }
  }, WORKER_LIVENESS_REFRESH_MS);
  livenessTimer.unref();

  const workerIntentProcessor = startWorkerIntentProcessor();
  const workerExtensions = startWorkerExtensions();
  const recoveryProcessor = startRecoveryProcessor();
  try {
    await Promise.all([worker.run(), deliveryWorker.run()]);
  } finally {
    clearInterval(livenessTimer);
    await Promise.all([
      workerIntentProcessor.close(),
      workerExtensions.close(),
      recoveryProcessor.close(),
    ]);
    // The shared client has no idle timeout: left open, it keeps a drained worker alive
    // after SIGTERM until the container runtime kills it.
    await closeRedisClient().catch(() => console.error("[temporal] redis close failed"));
  }
}
