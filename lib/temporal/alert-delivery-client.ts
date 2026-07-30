import "server-only";

import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";
import type { AlertDigestJob } from "../alerts/digest-types";
import { getTemporalClient } from "./client";

// `||`, not `??`: compose and other orchestrators pass an unset variable through as an
// empty string, and an empty task queue name makes Worker.create throw at startup.
export const ALERT_DELIVERY_TASK_QUEUE =
  process.env.TEMPORAL_ALERT_DELIVERY_TASK_QUEUE || "alert-deliveries";
export const ALERT_DELIVERY_WORKFLOW_TYPE = "alertDeliveryWorkflow";
export const ALERT_DIGEST_DELIVERY_WORKFLOW_TYPE = "alertDigestDeliveryWorkflow";

export function alertDeliveryWorkflowId(alertId: string) {
  return `alert-delivery-${alertId}`;
}

export function alertDigestDeliveryWorkflowId(job: AlertDigestJob) {
  return `alert-digest-${job.ruleId}-${job.alertIds[0] ?? "empty"}-${job.alertIds.length}`;
}

export async function startAlertDeliveryWorkflow(alertId: string): Promise<void> {
  const client = await getTemporalClient();
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
  const client = await getTemporalClient();
  try {
    await client.workflow.start(ALERT_DIGEST_DELIVERY_WORKFLOW_TYPE, {
      args: [job],
      taskQueue: ALERT_DELIVERY_TASK_QUEUE,
      workflowId: alertDigestDeliveryWorkflowId(job),
    });
  } catch (error) {
    if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
  }
}
