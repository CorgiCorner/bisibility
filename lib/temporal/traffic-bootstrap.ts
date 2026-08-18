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

export const TRAFFIC_SYNC_SCHEDULE_ID = "maintenance-traffic-sync";
export const TRAFFIC_SYNC_WORKFLOW_TYPE = "syncTrafficWorkflow";

const CATCHUP_WINDOW = "1 minute";
const DEFAULT_TRAFFIC_SYNC = { hour: 5, minute: 45 };

type BootstrapScheduleClient = Pick<Client["schedule"], "create">;
export type TrafficScheduleBootstrapStatus = "created" | "exists" | "disabled" | "failed";

export type EnsureTrafficSyncScheduleResult = {
  scheduleId: string;
  status: TrafficScheduleBootstrapStatus;
};

function isTruthyFlag(raw: string | undefined) {
  const value = raw?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function envValue(value: string | undefined) {
  const raw = value?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

export function isTrafficSyncEnabled() {
  return isTruthyFlag(process.env.TRAFFIC_SYNC_ENABLED);
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
