import "server-only";

import type { Client } from "@temporalio/client";
import {
  type BootstrapScheduleClient,
  type EnsureScheduleResult,
  ensureSingletonSchedule,
} from "./bootstrap";
import { isScheduledMaintenanceEnabled } from "./maintenance-schedule-bootstrap";
import { getSchedulerTemporalClient } from "./scheduler-client";

export const PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID =
  "maintenance-provider-usage-reconciliation";
export const PROVIDER_USAGE_RECONCILIATION_WORKFLOW_TYPE = "reconcileProviderUsageWorkflow";

type ReconciliationScheduleClient = BootstrapScheduleClient & Pick<Client["schedule"], "getHandle">;

function isScheduleNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "ScheduleNotFoundError"
  );
}

async function pauseProviderUsageReconciliationSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  try {
    const temporal =
      (client as ReconciliationScheduleClient | undefined) ??
      ((await getSchedulerTemporalClient()).schedule as ReconciliationScheduleClient);
    const handle = temporal.getHandle(PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID);
    const description = await handle.describe();
    if (!description.state.paused) {
      await handle.pause("Disabled by scheduled maintenance convergence");
    }
    return { scheduleId: PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID, status: "disabled" };
  } catch (error) {
    if (isScheduleNotFound(error)) {
      return { scheduleId: PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID, status: "disabled" };
    }
    console.error("[temporal] provider usage reconciliation pause failed", {
      error,
      scheduleId: PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID,
    });
    return { scheduleId: PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID, status: "failed" };
  }
}

export async function ensureProviderUsageReconciliationSchedule(
  client?: ReconciliationScheduleClient,
): Promise<EnsureScheduleResult> {
  const enabled = isScheduledMaintenanceEnabled();
  if (!enabled) {
    return pauseProviderUsageReconciliationSchedule(client);
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
