import "server-only";

import type { Client } from "@temporalio/client";
import {
  type BootstrapScheduleClient,
  type EnsureScheduleResult,
  ensureSingletonSchedule,
} from "./bootstrap";
import { isScheduledMaintenanceEnabled } from "./maintenance-schedule-bootstrap";
import { getSchedulerTemporalClient } from "./scheduler-client";

export const METERING_MAINTENANCE_SCHEDULE_ID = "maintenance-metering-reservations";
export const METERING_MAINTENANCE_WORKFLOW_TYPE = "maintainMeteringReservationsWorkflow";

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
  try {
    const temporal = client ?? (await getSchedulerTemporalClient()).schedule;
    const handle = temporal.getHandle("maintenance-metering-shadow");
    const before = await handle.describe();
    if (!before.state.paused) await handle.pause("Retired by authoritative accounting maintenance");
    const paused = await handle.describe();
    if (paused.info?.runningActions?.length)
      throw new Error("Retired shadow workflow has not drained");
    await handle.delete();
  } catch (error) {
    if (!isScheduleNotFound(error)) {
      console.error("[temporal] retired shadow maintenance has not converged", { error });
      return { scheduleId: METERING_MAINTENANCE_SCHEDULE_ID, status: "failed" };
    }
  }
  if (!isScheduledMaintenanceEnabled()) {
    return pauseMeteringSchedule(client);
  }

  return ensureSingletonSchedule(
    {
      convergeSpec: true,
      enabled: true,
      memo: { kind: METERING_MAINTENANCE_SCHEDULE_ID },
      note: "Authoritative accounting reservation expiry",
      scheduleId: METERING_MAINTENANCE_SCHEDULE_ID,
      spec: { intervals: [{ every: "1 minute" }] },
      workflowType: METERING_MAINTENANCE_WORKFLOW_TYPE,
    },
    client,
  );
}
