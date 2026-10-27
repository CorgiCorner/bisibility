import "server-only";

import type { Client } from "@temporalio/client";
import {
  type BootstrapScheduleClient,
  type EnsureScheduleResult,
  ensureSingletonSchedule,
} from "./bootstrap";
import { isScheduledMaintenanceEnabled } from "./maintenance-schedule-bootstrap";
import { pauseSingletonSchedule } from "./schedule-pause";

export const PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID =
  "maintenance-provider-usage-reconciliation";
export const PROVIDER_USAGE_RECONCILIATION_WORKFLOW_TYPE = "reconcileProviderUsageWorkflow";

type ReconciliationScheduleClient = BootstrapScheduleClient & Pick<Client["schedule"], "getHandle">;

export async function ensureProviderUsageReconciliationSchedule(
  client?: ReconciliationScheduleClient,
): Promise<EnsureScheduleResult> {
  const enabled = isScheduledMaintenanceEnabled();
  if (!enabled) {
    return pauseSingletonSchedule(
      {
        scheduleId: PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID,
        note: "Disabled by scheduled maintenance convergence",
        failureMessage: "[temporal] provider usage reconciliation pause failed",
      },
      client,
    );
  }

  return ensureSingletonSchedule(
    {
      enabled,
      memo: { kind: PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID },
      note: "Provider usage receipt reconciliation",
      scheduleId: PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID,
      spec: { intervals: [{ every: "5 minutes" }] },
      workflowType: PROVIDER_USAGE_RECONCILIATION_WORKFLOW_TYPE,
    },
    client,
  );
}
