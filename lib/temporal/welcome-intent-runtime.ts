import { collectTemporalHeartbeat } from "../ops/heartbeat-temporal";
import { refreshWorkerLiveness, WORKER_LIVENESS_REFRESH_MS } from "../ops/liveness";
import { publishTemporalSnapshot } from "../ops/temporal-snapshot";
import { type TemporalConnectionOptions, temporalWebUiUrl } from "./connection-options";
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

  const livenessTimer = setInterval(() => {
    void refreshWorkerLiveness().catch(() =>
      console.error("[ops] periodic liveness refresh failed"),
    );
    void publishTemporalSnapshot(new Date(), collectTemporalHeartbeat);
  }, WORKER_LIVENESS_REFRESH_MS);
  livenessTimer.unref();

  const workerIntentProcessor = startWorkerIntentProcessor();
  try {
    await Promise.all([worker.run(), deliveryWorker.run()]);
  } finally {
    clearInterval(livenessTimer);
    await workerIntentProcessor.close();
  }
}
