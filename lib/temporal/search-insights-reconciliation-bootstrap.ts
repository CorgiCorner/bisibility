import "server-only";

import type { Client } from "@temporalio/client";
import {
  type BootstrapScheduleClient,
  type EnsureScheduleResult,
  ensureSingletonSchedule,
} from "./bootstrap";
import { isScheduledMaintenanceEnabled } from "./maintenance-schedule-bootstrap";
import { getSchedulerTemporalClient } from "./scheduler-client";

export const SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID =
  "maintenance-search-insights-queued-imports";
export const SEARCH_INSIGHTS_QUEUE_RECONCILIATION_WORKFLOW_TYPE =
  "reconcileQueuedSearchInsightsImportsWorkflow";

type ReconciliationScheduleClient = BootstrapScheduleClient & Pick<Client["schedule"], "getHandle">;

function isScheduleNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "ScheduleNotFoundError"
  );
}

async function pauseReconciliationSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  try {
    const temporal =
      (client as ReconciliationScheduleClient | undefined) ??
      ((await getSchedulerTemporalClient()).schedule as ReconciliationScheduleClient);
    const handle = temporal.getHandle(SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID);
    const description = await handle.describe();
    if (!description.state.paused) {
      await handle.pause("Disabled by scheduled maintenance convergence");
    }
    return { scheduleId: SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID, status: "disabled" };
  } catch (error) {
    if (isScheduleNotFound(error)) {
      return { scheduleId: SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID, status: "disabled" };
    }
    console.error("[temporal] search insights reconciliation pause failed", {
      error,
      scheduleId: SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID,
    });
    return { scheduleId: SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID, status: "failed" };
  }
}

export async function ensureSearchInsightsQueueReconciliationSchedule(
  client?: ReconciliationScheduleClient,
): Promise<EnsureScheduleResult> {
  const enabled = isScheduledMaintenanceEnabled();
  if (!enabled) {
    return pauseReconciliationSchedule(client);
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
