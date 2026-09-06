import "server-only";

import {
  type Client,
  ScheduleAlreadyRunning,
  type ScheduleOptions,
  ScheduleOverlapPolicy,
  type ScheduleSpec,
} from "@temporalio/client";
import { TEMPORAL_TASK_QUEUE } from "./client";
import { getSchedulerTemporalClient } from "./scheduler-client";
import { isTrafficSyncEnabled } from "./traffic-sync-enabled";

export { isTrafficSyncEnabled } from "./traffic-sync-enabled";

export const TRAFFIC_SYNC_SCHEDULE_ID = "maintenance-traffic-sync";
export const TRAFFIC_SYNC_WORKFLOW_TYPE = "syncTrafficWorkflow";
export const RETIRED_TRAFFIC_INTENT_SWEEP_SCHEDULE_ID = "maintenance-traffic-intent-sweep";

const CATCHUP_WINDOW = "1 minute";
const DEFAULT_TRAFFIC_SYNC = { hour: 5, minute: 45 };

type BootstrapScheduleClient = Pick<Client["schedule"], "create">;
export type TrafficScheduleBootstrapStatus = "created" | "exists" | "disabled" | "failed";

export type EnsureTrafficSyncScheduleResult = {
  scheduleId: string;
  status: TrafficScheduleBootstrapStatus;
};

export type RetiredTrafficIntentScheduleResult = {
  scheduleId: string;
  status: "absent" | "deleted";
};

export type RetiredTrafficIntentScheduleClient = {
  getHandle(scheduleId: string): { delete(): Promise<void> };
};

function envValue(value: string | undefined) {
  const raw = value?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

function trafficSyncSpec(): ScheduleSpec {
  const cron = envValue(process.env.TRAFFIC_SYNC_CRON);
  return cron ? { cronExpressions: [cron] } : { calendars: [DEFAULT_TRAFFIC_SYNC] };
}

function isScheduleAlreadyRunning(error: unknown) {
  return (
    error instanceof ScheduleAlreadyRunning ||
    (error as { name?: string }).name === "ScheduleAlreadyRunning"
  );
}

function isScheduleNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "ScheduleNotFoundError"
  );
}

function buildTrafficSyncScheduleOptions(): ScheduleOptions {
  return {
    action: {
      args: [],
      taskQueue: TEMPORAL_TASK_QUEUE,
      type: "startWorkflow",
      workflowId: TRAFFIC_SYNC_SCHEDULE_ID,
      workflowType: TRAFFIC_SYNC_WORKFLOW_TYPE,
    },
    memo: { kind: "maintenance-traffic-sync" },
    policies: {
      catchupWindow: CATCHUP_WINDOW,
      overlap: ScheduleOverlapPolicy.SKIP,
      pauseOnFailure: false,
    },
    scheduleId: TRAFFIC_SYNC_SCHEDULE_ID,
    spec: trafficSyncSpec(),
    state: { note: "Daily traffic sync", paused: false },
  };
}

export async function ensureTrafficSyncSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureTrafficSyncScheduleResult> {
  if (!isTrafficSyncEnabled()) {
    console.info("[traffic] first-sync intents disabled because traffic sync is disabled");
    return { scheduleId: TRAFFIC_SYNC_SCHEDULE_ID, status: "disabled" };
  }

  try {
    const temporal = client ?? (await getSchedulerTemporalClient()).schedule;
    await temporal.create(buildTrafficSyncScheduleOptions());
    return { scheduleId: TRAFFIC_SYNC_SCHEDULE_ID, status: "created" };
  } catch (error) {
    if (isScheduleAlreadyRunning(error)) {
      return { scheduleId: TRAFFIC_SYNC_SCHEDULE_ID, status: "exists" };
    }

    console.error("[temporal] schedule bootstrap failed", {
      error,
      scheduleId: TRAFFIC_SYNC_SCHEDULE_ID,
    });
    return { scheduleId: TRAFFIC_SYNC_SCHEDULE_ID, status: "failed" };
  }
}

export async function deleteRetiredTrafficIntentSweepSchedule(
  client?: RetiredTrafficIntentScheduleClient,
): Promise<RetiredTrafficIntentScheduleResult> {
  try {
    const temporal = client ?? (await getSchedulerTemporalClient()).schedule;
    await temporal.getHandle(RETIRED_TRAFFIC_INTENT_SWEEP_SCHEDULE_ID).delete();
    return {
      scheduleId: RETIRED_TRAFFIC_INTENT_SWEEP_SCHEDULE_ID,
      status: "deleted",
    };
  } catch (error) {
    if (isScheduleNotFound(error)) {
      return {
        scheduleId: RETIRED_TRAFFIC_INTENT_SWEEP_SCHEDULE_ID,
        status: "absent",
      };
    }
    console.error("[temporal] retired traffic intent schedule cleanup failed", {
      error,
      scheduleId: RETIRED_TRAFFIC_INTENT_SWEEP_SCHEDULE_ID,
    });
    throw new Error("Failed to retire traffic intent sweep schedule.", {
      cause: error,
    });
  }
}
