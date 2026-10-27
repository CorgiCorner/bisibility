import "server-only";

import type { Client } from "@temporalio/client";
import {
  type BootstrapScheduleClient,
  type EnsureScheduleResult,
  ensureSingletonSchedule,
} from "./bootstrap";
import { isScheduledMaintenanceEnabled } from "./maintenance-schedule-bootstrap";
import { pauseSingletonSchedule } from "./schedule-pause";

export const SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID =
  "maintenance-search-insights-queued-imports";
export const SEARCH_INSIGHTS_QUEUE_RECONCILIATION_WORKFLOW_TYPE =
  "reconcileQueuedSearchInsightsImportsWorkflow";

type ReconciliationScheduleClient = BootstrapScheduleClient & Pick<Client["schedule"], "getHandle">;

export async function ensureSearchInsightsQueueReconciliationSchedule(
  client?: ReconciliationScheduleClient,
): Promise<EnsureScheduleResult> {
  const enabled = isScheduledMaintenanceEnabled();
  if (!enabled) {
    return pauseSingletonSchedule(
      {
        scheduleId: SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID,
        note: "Disabled by scheduled maintenance convergence",
        failureMessage: "[temporal] search insights reconciliation pause failed",
      },
      client,
    );
  }

  return ensureSingletonSchedule(
    {
      enabled,
      memo: { kind: SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID },
      note: "Queued search insights import reconciliation",
      scheduleId: SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID,
      spec: { intervals: [{ every: "5 minutes" }] },
      workflowType: SEARCH_INSIGHTS_QUEUE_RECONCILIATION_WORKFLOW_TYPE,
    },
    client,
  );
}
