import "server-only";

import type { Client } from "@temporalio/client";
import {
  type BootstrapScheduleClient,
  type EnsureScheduleResult,
  ensureSingletonSchedule,
} from "./bootstrap";
import { isScheduledMaintenanceEnabled } from "./maintenance-schedule-bootstrap";
import { getSchedulerTemporalClient } from "./scheduler-client";

export const METERING_MAINTENANCE_SCHEDULE_ID = "maintenance-metering-shadow";
export const METERING_MAINTENANCE_WORKFLOW_TYPE = "maintainMeteringShadowWorkflow";

type MeteringScheduleClient = BootstrapScheduleClient & Pick<Client["schedule"], "getHandle">;

function isScheduleNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "ScheduleNotFoundError"
  );
}

async function pauseMeteringSchedule(
  client?: MeteringScheduleClient,
): Promise<EnsureScheduleResult> {
  try {
    const temporal = client ?? (await getSchedulerTemporalClient()).schedule;
    const handle = temporal.getHandle(METERING_MAINTENANCE_SCHEDULE_ID);
    const description = await handle.describe();
    if (!description.state.paused) {
      await handle.pause("Disabled by metering maintenance convergence");
    }
    return { scheduleId: METERING_MAINTENANCE_SCHEDULE_ID, status: "disabled" };
  } catch (error) {
    if (isScheduleNotFound(error)) {
      return { scheduleId: METERING_MAINTENANCE_SCHEDULE_ID, status: "disabled" };
    }
    console.error("[temporal] metering maintenance pause failed", {
      error,
      scheduleId: METERING_MAINTENANCE_SCHEDULE_ID,
    });
    return { scheduleId: METERING_MAINTENANCE_SCHEDULE_ID, status: "failed" };
  }
}

export async function ensureMeteringMaintenanceSchedule(
  client?: MeteringScheduleClient,
): Promise<EnsureScheduleResult> {
  if (!isScheduledMaintenanceEnabled() || process.env.METERING_SHADOW !== "on") {
    return pauseMeteringSchedule(client);
  }

  return ensureSingletonSchedule(
    {
      convergeSpec: true,
      enabled: true,
      memo: { kind: METERING_MAINTENANCE_SCHEDULE_ID },
      note: "Shadow usage reservation and receipt maintenance",
      scheduleId: METERING_MAINTENANCE_SCHEDULE_ID,
      spec: { intervals: [{ every: "1 minute" }] },
      workflowType: METERING_MAINTENANCE_WORKFLOW_TYPE,
    },
    client,
  );
}
