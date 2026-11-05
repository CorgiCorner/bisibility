import "server-only";

import { createHash } from "node:crypto";
import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from "@temporalio/client";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";
import type { AlertDigestJob } from "../alerts/digest-types";
import { temporalDeploymentConfig } from "./deployment-config";
import { fencedDigestTaskQueue } from "./digest-fencing";
import { getSchedulerTemporalClient } from "./scheduler-client";

// `||`, not `??`: compose and other orchestrators pass an unset variable through as an
// empty string, and an empty task queue name makes Worker.create throw at startup.
export const ALERT_DELIVERY_TASK_QUEUE = temporalDeploymentConfig().alertDeliveryTaskQueue;
export const ALERT_DELIVERY_WORKFLOW_TYPE = "alertDeliveryWorkflow";
export const ALERT_DIGEST_DELIVERY_WORKFLOW_TYPE = "alertDigestDeliveryWorkflow";

export function alertDeliveryWorkflowId(alertId: string) {
  return `alert-delivery-${alertId}`;
}

export function alertDigestDeliveryWorkflowId(job: AlertDigestJob) {
  return `alert-digest-${job.ruleId}-${[...job.alertIds].sort()[0] ?? "empty"}-${job.alertIds.length}`;
}

export async function startAlertDeliveryWorkflow(alertId: string): Promise<void> {
  const client = await getSchedulerTemporalClient();
  try {
    await client.workflow.start(ALERT_DELIVERY_WORKFLOW_TYPE, {
      args: [{ alertId }],
      taskQueue: ALERT_DELIVERY_TASK_QUEUE,
      workflowId: alertDeliveryWorkflowId(alertId),
    });
  } catch (error) {
    if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
  }
}

export async function enqueueAlertDeliveries(alertIds: string[]): Promise<void> {
  await Promise.all(
    alertIds.map((alertId) => startAlertDeliveryWorkflow(alertId).catch(() => undefined)),
  );
}

export async function enqueueAlertDigestJob(job: AlertDigestJob): Promise<void> {
  const client = await getSchedulerTemporalClient();
  const digestBatchIdentity = createHash("sha256")
    .update(JSON.stringify([job.ruleId, [...job.alertIds].sort()]))
    .digest("hex");
  const digestActivityTaskQueue = fencedDigestTaskQueue(ALERT_DELIVERY_TASK_QUEUE);
  const handle = await client.workflow.start(ALERT_DIGEST_DELIVERY_WORKFLOW_TYPE, {
    args: [job],
    memo: {
      digestBatchIdentity,
      digestClaimToken: job.deliveryClaimToken,
      digestActivityTaskQueue,
    },
    taskQueue: digestActivityTaskQueue,
    workflowId: alertDigestDeliveryWorkflowId(job),
    workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
    workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
  });
  const existing = await handle.describe();
  if (
    existing.memo?.digestBatchIdentity !== digestBatchIdentity ||
    existing.memo?.digestClaimToken !== job.deliveryClaimToken
  ) {
    throw new Error("Digest workflow belongs to another batch or claim owner.");
  }
}
