import { proxyActivities, workflowInfo } from "@temporalio/workflow";
import { FENCED_DIGEST_MAX_ATTEMPTS, fencedDigestTaskQueue } from "./digest-fencing";
import type * as Activities from "./fenced-digest-activities";

export function fencedDigestProxies() {
  const info = workflowInfo();
  const recordedQueue = info.memo?.digestActivityTaskQueue;
  const taskQueue =
    typeof recordedQueue === "string" && recordedQueue
      ? recordedQueue
      : fencedDigestTaskQueue(info.taskQueue);
  const lifecycle = proxyActivities<
    Pick<
      typeof Activities,
      "prepareFencedAlertDigestActivity" | "finalizeFencedAlertDigestActivity"
    >
  >({
    taskQueue,
    retry: { initialInterval: "5 seconds", maximumAttempts: 3 },
    startToCloseTimeout: "30 seconds",
  });
  const channels = proxyActivities<typeof Activities>({
    taskQueue,
    retry: {
      backoffCoefficient: 2,
      initialInterval: "10 seconds",
      maximumAttempts: FENCED_DIGEST_MAX_ATTEMPTS,
      maximumInterval: "10 minutes",
    },
    startToCloseTimeout: "1 minute",
  });
  return {
    prepare: lifecycle.prepareFencedAlertDigestActivity,
    finalize: lifecycle.finalizeFencedAlertDigestActivity,
    channels: {
      deliverAlertDigestEmailActivity: channels.deliverFencedAlertDigestEmailActivity,
      deliverAlertDigestPushActivity: channels.deliverFencedAlertDigestPushActivity,
      deliverAlertDigestSlackActivity: channels.deliverFencedAlertDigestSlackActivity,
      deliverAlertDigestWebhookActivity: channels.deliverFencedAlertDigestWebhookActivity,
    },
  };
}
