import "server-only";

import { getOpsConfig } from "@/lib/ops/config";
import {
  type BootstrapScheduleClient,
  type EnsureScheduleResult,
  ensureSingletonSchedule,
} from "./bootstrap";

export const OPS_HEARTBEAT_SCHEDULE_ID = "ops-heartbeat";
export const OPS_HEARTBEAT_WORKFLOW_TYPE = "opsHeartbeatWorkflow";

export async function ensureOpsHeartbeatSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  const config = getOpsConfig();
  return ensureSingletonSchedule(
    {
      enabled: config.enabled,
      memo: { kind: "ops-heartbeat" },
      note: "Daily operator observability digest",
      scheduleId: OPS_HEARTBEAT_SCHEDULE_ID,
      spec: {
        cronExpressions: [config.heartbeatCron],
        timezone: config.heartbeatTimezone,
      },
      workflowType: OPS_HEARTBEAT_WORKFLOW_TYPE,
    },
    client,
  );
}
