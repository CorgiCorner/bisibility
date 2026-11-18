import { proxyActivities, sleep } from "@temporalio/workflow";
import type { executeModelPlaygroundActivity } from "./model-playground-activities";

const { executeModelPlaygroundActivity: execute } = proxyActivities<{
  executeModelPlaygroundActivity: typeof executeModelPlaygroundActivity;
}>({
  startToCloseTimeout: "5 minutes",
  retry: { initialInterval: "5 seconds", maximumInterval: "30 seconds" },
});

// MODEL_PLAYGROUND_WORKER_ENABLED has never been on in a shared namespace, so no
// modelPlaygroundWorkflow execution exists to replay. This definition may change in place.
export async function modelPlaygroundWorkflow(input: {
  projectId: string;
  runId: string;
}): Promise<void> {
  // Activity retry reloads the durable fence; it never authorizes a paid retry.
  for (;;) {
    try {
      const progress = await execute(input);
      if (progress.terminal || progress.stopped) return;
      await sleep(progress.retryAfterMs ?? 2_000);
    } catch {
      // Transient failures retain durable custody. Only SQL progress can give up.
      await sleep("30 seconds");
    }
  }
}
