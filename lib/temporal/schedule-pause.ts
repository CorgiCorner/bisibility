import "server-only";

import type { Client } from "@temporalio/client";
import { type BootstrapScheduleClient, type EnsureScheduleResult, hasErrorName } from "./bootstrap";
import { getSchedulerTemporalClient } from "./scheduler-client";

type PauseScheduleClient = Pick<Client["schedule"], "getHandle">;

type PauseScheduleOptions = {
  scheduleId: string;
  note: string;
  failureMessage: string;
};

/** Disabled maintenance schedules converge without changing workflow ownership or deleting work. */
export async function pauseSingletonSchedule(
  options: PauseScheduleOptions,
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  try {
    const temporal = (client ??
      (await getSchedulerTemporalClient()).schedule) as PauseScheduleClient;
    const handle = temporal.getHandle(options.scheduleId);
    const description = await handle.describe();
    if (!description.state.paused) await handle.pause(options.note);
    return { scheduleId: options.scheduleId, status: "disabled" };
  } catch (error) {
    if (hasErrorName(error, "ScheduleNotFoundError")) {
      return { scheduleId: options.scheduleId, status: "disabled" };
    }
    console.error(options.failureMessage, { error, scheduleId: options.scheduleId });
    return { scheduleId: options.scheduleId, status: "failed" };
  }
}
