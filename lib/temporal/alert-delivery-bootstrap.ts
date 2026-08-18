import "server-only";

import { ALERT_DELIVERY_TASK_QUEUE } from "./alert-delivery-client";
import {
  type BootstrapScheduleClient,
  type EnsureScheduleResult,
  ensureSingletonSchedule,
  envValue,
  isFalseyFlag,
} from "./bootstrap";

export const ALERT_DELIVERY_SWEEP_SCHEDULE_ID = "alert-delivery-sweep";
export const ALERT_DELIVERY_SWEEP_WORKFLOW_TYPE = "sweepAlertDeliveriesWorkflow";

export function isAlertDeliverySweepEnabled() {
  return !isFalseyFlag(process.env.ALERT_DELIVERY_SWEEP_ENABLED);
}

export async function ensureAlertDeliverySweepSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  return ensureSingletonSchedule(
    {
      enabled: isAlertDeliverySweepEnabled(),
      memo: { kind: "alert-delivery-sweep" },
      note: "Alert delivery recovery sweep",
      scheduleId: ALERT_DELIVERY_SWEEP_SCHEDULE_ID,
      spec: {
        intervals: [{ every: envValue(process.env.ALERT_DELIVERY_SWEEP_INTERVAL) ?? "1 minute" }],
      },
      taskQueue: ALERT_DELIVERY_TASK_QUEUE,
      workflowType: ALERT_DELIVERY_SWEEP_WORKFLOW_TYPE,
    },
    client,
  );
}
