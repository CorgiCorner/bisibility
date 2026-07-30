import "server-only";

import {
  type CalendarSpec,
  type Client,
  ScheduleAlreadyRunning,
  ScheduleNotFoundError,
  type ScheduleOptions,
  ScheduleOverlapPolicy,
  type ScheduleSpec,
} from "@temporalio/client";
import { msToNumber } from "@temporalio/common";
import { legacySchedulingAllowed } from "../rank-check/scheduler-mode";
import { getTemporalClient, TEMPORAL_TASK_QUEUE } from "./client";

// Idempotent worker bootstrap for worker-owned Temporal Schedules. Rank-check
// singleton ownership is converged separately from independent maintenance,
// alert, traffic, sitemap, presence, and ops Schedules. The app never has to
// reach the firewalled Temporal gRPC frontend.

/** Schedule id for the singleton reconciler. Shares the `rank-check-` prefix but
 * is reserved (never pruned) by lib/rank-check/reconciler.ts. */
export const RECONCILER_SCHEDULE_ID = "rank-check-reconciler";
export const RETIRED_JOB_PROCESSOR_SCHEDULE_ID = "maintenance-job-processor";

/** Must match the exported workflow function names in the workflow bundle. */
export const RECONCILE_WORKFLOW_TYPE = "reconcileRankCheckSchedulesWorkflow";

const DEFAULT_INTERVAL = "2 minutes";
const DEFAULT_CATCHUP_WINDOW = "1 hour";

/**
 * Overlap SKIP collapses buffered catch-up actions, making a wide window safe.
 */
export function catchupWindow() {
  return envValue("TEMPORAL_SCHEDULE_CATCHUP_WINDOW") ?? DEFAULT_CATCHUP_WINDOW;
}

// `getHandle` is optional for create-only test mocks; existing schedule convergence
// is skipped when unavailable.
export type BootstrapScheduleClient = Pick<Client["schedule"], "create"> &
  Partial<Pick<Client["schedule"], "getHandle">>;
export type RetiredScheduleCleanupClient = {
  getHandle(scheduleId: string): { delete(): Promise<void> };
};
export type CalendarDefaults = {
  dayOfWeek?: NonNullable<CalendarSpec["dayOfWeek"]>;
  hour: CalendarSpec["hour"];
  minute: CalendarSpec["minute"];
};

export type ScheduleBootstrapStatus = "created" | "exists" | "updated" | "disabled" | "failed";

export type EnsureScheduleResult = {
  scheduleId: string;
  status: ScheduleBootstrapStatus;
};

export type RetiredScheduleCleanupResult = {
  scheduleId: string;
  status: "absent" | "deleted" | "failed";
};

export function isTruthyFlag(raw: string | undefined) {
  const value = raw?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function isFalseyFlag(raw: string | undefined) {
  const value = raw?.trim().toLowerCase();
  return value === "0" || value === "false" || value === "no" || value === "off";
}

export function envValue(name: string) {
  const raw = process.env[name]?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

export function isReconcilerEnabled() {
  return legacySchedulingAllowed();
}

function reconcilerInterval() {
  return envValue("RANK_CHECK_RECONCILER_INTERVAL") ?? DEFAULT_INTERVAL;
}

/** Calendar spec, overridable by a single cron expression env var. */
export function calendarSpec(defaults: CalendarDefaults, cronEnv: string): ScheduleSpec {
  const cron = envValue(cronEnv);
  if (cron) {
    return { cronExpressions: [cron] };
  }

  return { calendars: [defaults] };
}

function hasErrorName(error: unknown, name: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === name
  );
}

function isScheduleAlreadyRunning(error: unknown) {
  return error instanceof ScheduleAlreadyRunning || hasErrorName(error, "ScheduleAlreadyRunning");
}

function isScheduleNotFound(error: unknown) {
  return error instanceof ScheduleNotFoundError || hasErrorName(error, "ScheduleNotFoundError");
}

/**
 * Remove the retired DB queue schedule before upgraded workers start its missing workflow.
 */
export async function deleteRetiredJobProcessorSchedule(
  client?: RetiredScheduleCleanupClient,
): Promise<RetiredScheduleCleanupResult> {
  try {
    const temporal = client ?? (await getTemporalClient()).schedule;
    await temporal.getHandle(RETIRED_JOB_PROCESSOR_SCHEDULE_ID).delete();
    return { scheduleId: RETIRED_JOB_PROCESSOR_SCHEDULE_ID, status: "deleted" };
  } catch (error) {
    if (isScheduleNotFound(error)) {
      return { scheduleId: RETIRED_JOB_PROCESSOR_SCHEDULE_ID, status: "absent" };
    }

    console.error("[temporal] retired schedule cleanup failed", {
      error,
      scheduleId: RETIRED_JOB_PROCESSOR_SCHEDULE_ID,
    });
    return { scheduleId: RETIRED_JOB_PROCESSOR_SCHEDULE_ID, status: "failed" };
  }
}

export type SingletonScheduleConfig = {
  args?: unknown[];
  convergeSpec?: boolean;
  enabled: boolean;
  memo: Record<string, unknown>;
  note: string;
  scheduleId: string;
  spec: ScheduleSpec;
  taskQueue?: string;
  workflowType: string;
};

function buildScheduleOptions(config: SingletonScheduleConfig): ScheduleOptions {
  return {
    action: {
      args: config.args ?? [],
      taskQueue: config.taskQueue ?? TEMPORAL_TASK_QUEUE,
      type: "startWorkflow",
      workflowId: config.scheduleId,
      workflowType: config.workflowType,
    },
    memo: config.memo,
    policies: {
      catchupWindow: catchupWindow(),
      overlap: ScheduleOverlapPolicy.SKIP,
      pauseOnFailure: false,
    },
    scheduleId: config.scheduleId,
    spec: config.spec,
    state: { note: config.note, paused: false },
  };
}

/**
 * Converge catchupWindow and, for explicitly opted-in singletons, the Schedule spec.
 */
async function convergeExistingSchedule(
  temporal: BootstrapScheduleClient,
  config: SingletonScheduleConfig,
): Promise<ScheduleBootstrapStatus> {
  const getHandle = temporal.getHandle?.bind(temporal);
  if (!getHandle) {
    return "exists";
  }

  try {
    const handle = getHandle(config.scheduleId);
    const description = await handle.describe();
    if (
      description.action.workflowType !== config.workflowType ||
      description.action.workflowId !== config.scheduleId
    ) {
      console.error("[temporal] singleton action convergence failed closed", {
        scheduleId: config.scheduleId,
      });
      return "failed";
    }
    const desiredMs = msToNumber(catchupWindow());
    const desiredInterval = config.convergeSpec ? config.spec.intervals?.[0]?.every : undefined;
    const currentInterval = config.convergeSpec
      ? description.spec.intervals?.[0]?.every
      : undefined;
    const specChanged =
      Boolean(config.convergeSpec && desiredInterval !== undefined) &&
      msToNumber(desiredInterval) !== msToNumber(currentInterval ?? 0);
    const policyChanged = description.policies.catchupWindow !== desiredMs;
    const stateChanged = description.state?.paused === true;
    if (!policyChanged && !specChanged && !stateChanged) {
      return "exists";
    }

    await handle.update((previous) => {
      previous.policies.catchupWindow = desiredMs;
      if (specChanged && desiredInterval !== undefined) {
        previous.spec.intervals = [{ every: msToNumber(desiredInterval), offset: 0 }];
      }
      previous.state = { ...previous.state, paused: false };
      return previous;
    });
    return "updated";
  } catch (error) {
    console.error("[temporal] schedule policy convergence failed", {
      error,
      scheduleId: config.scheduleId,
    });
    return "failed";
  }
}

/**
 * Schedule creation failures never crash the worker; existing schedules converge catchupWindow.
 */
export async function ensureSingletonSchedule(
  config: SingletonScheduleConfig,
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  if (!config.enabled) {
    return { scheduleId: config.scheduleId, status: "disabled" };
  }

  try {
    const temporal = client ?? (await getTemporalClient()).schedule;
    try {
      await temporal.create(buildScheduleOptions(config));
      return { scheduleId: config.scheduleId, status: "created" };
    } catch (error) {
      if (isScheduleAlreadyRunning(error)) {
        const status = await convergeExistingSchedule(temporal, config);
        return { scheduleId: config.scheduleId, status };
      }
      throw error;
    }
  } catch (error) {
    console.error("[temporal] schedule bootstrap failed", {
      error,
      scheduleId: config.scheduleId,
    });
    return { scheduleId: config.scheduleId, status: "failed" };
  }
}

/** Singleton rank-check schedule reconciler (short interval sweep). */
export async function ensureReconcilerSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  return ensureSingletonSchedule(
    {
      enabled: isReconcilerEnabled(),
      memo: { kind: "rank-check-reconciler" },
      note: "Rank check schedule reconciler",
      scheduleId: RECONCILER_SCHEDULE_ID,
      spec: { intervals: [{ every: reconcilerInterval() }] },
      workflowType: RECONCILE_WORKFLOW_TYPE,
    },
    client,
  );
}

export {
  ensureTrafficSyncSchedule,
  isTrafficSyncEnabled,
  TRAFFIC_SYNC_SCHEDULE_ID,
  TRAFFIC_SYNC_WORKFLOW_TYPE,
} from "./traffic-bootstrap";
