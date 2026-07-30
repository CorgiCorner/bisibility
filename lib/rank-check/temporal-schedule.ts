import "server-only";

import {
  getTemporalClient,
  RANK_CHECK_WORKFLOW_TYPE,
  rankCheckSearchAttributes,
  rankCheckWorkflowId,
  TEMPORAL_TASK_QUEUE,
} from "@/lib/temporal/client";
import type { RankCheckWorkflowInput, RankCheckWorkflowResult } from "@/lib/temporal/workflows";
import {
  type Client,
  ScheduleAlreadyRunning,
  ScheduleNotFoundError,
  type ScheduleOptions,
  ScheduleOverlapPolicy,
  type ScheduleUpdateOptions,
} from "@temporalio/client";
import { monthlyCronExpression as cronExpressionForMonthlyAnchor } from "./cron";
import { DAILY_INTERVAL_MS, stableIntervalPhaseMs, WEEKLY_INTERVAL_MS } from "./interval-phase";
import { isScheduledFrequency, type RankCheckScheduleInput } from "./schedule";
import { legacySchedulingAllowed } from "./scheduler-mode";

type RankCheckWorkflow = (input: RankCheckWorkflowInput) => Promise<RankCheckWorkflowResult>;
type RankCheckScheduleOptions = ScheduleOptions<{
  type: "startWorkflow";
  workflowType: string | RankCheckWorkflow;
  taskQueue: string;
  workflowId: string;
  args: [RankCheckWorkflowInput];
  typedSearchAttributes: ReturnType<typeof rankCheckSearchAttributes>;
}>;
type RankCheckScheduleUpdate = ScheduleUpdateOptions<RankCheckScheduleOptions["action"]>;

type TemporalScheduleHandle = {
  delete(): Promise<void>;
  update(updateFn: (previous: unknown) => RankCheckScheduleUpdate): Promise<void>;
};

export type TemporalScheduleClient = Pick<Client["schedule"], "create"> & {
  getHandle(scheduleId: string): TemporalScheduleHandle;
};

export type SyncRankCheckScheduleInput = {
  keywordId: string;
  projectId: string;
  providerId?: string;
  schedule: RankCheckScheduleInput;
};

export type SyncRankCheckScheduleResult = {
  scheduleId: string;
  status: "created" | "deleted" | "missing" | "updated";
  workflowId: string;
};

const CATCHUP_WINDOW = "1 hour";

export function rankCheckScheduleId(keywordId: string) {
  return rankCheckWorkflowId(keywordId);
}

function jitterMs(schedule: RankCheckScheduleInput) {
  const minutes = Math.max(0, Math.floor(schedule.jitterMinutes ?? 60));
  return minutes > 0 ? minutes * 60_000 : undefined;
}

function monthlyCronExpression(schedule: RankCheckScheduleInput) {
  if (!schedule.nextCheckAt) {
    throw new Error("Monthly schedules require nextCheckAt.");
  }
  return cronExpressionForMonthlyAnchor(schedule.nextCheckAt, schedule.timezone ?? "UTC");
}

export function buildRankCheckScheduleSpec(schedule: RankCheckScheduleInput, keywordId: string) {
  if (!isScheduledFrequency(schedule.frequency)) {
    throw new Error("Only automatic rank-check schedules can be synced to Temporal.");
  }

  const common = {
    ...(jitterMs(schedule) ? { jitter: jitterMs(schedule) } : {}),
    timezone: schedule.timezone ?? "UTC",
  };

  if (schedule.frequency === "daily") {
    return {
      ...common,
      intervals: [{ every: "1 day", offset: stableIntervalPhaseMs(keywordId, DAILY_INTERVAL_MS) }],
    };
  }

  if (schedule.frequency === "weekly") {
    return {
      ...common,
      intervals: [
        { every: "7 days", offset: stableIntervalPhaseMs(keywordId, WEEKLY_INTERVAL_MS) },
      ],
    };
  }

  if (schedule.frequency === "monthly") {
    return { ...common, cronExpressions: [monthlyCronExpression(schedule)] };
  }

  if (!schedule.cronExpression) {
    throw new Error("Custom cron schedules require cronExpression.");
  }

  return { ...common, cronExpressions: [schedule.cronExpression] };
}

export function buildRankCheckScheduleOptions(
  input: SyncRankCheckScheduleInput,
): RankCheckScheduleOptions {
  const workflowId = rankCheckWorkflowId(input.keywordId);
  const searchAttributes = rankCheckSearchAttributes({
    keywordId: input.keywordId,
    projectId: input.projectId,
    provider: input.providerId,
  });

  return {
    action: {
      args: [{ keywordId: input.keywordId, providerId: input.providerId }],
      typedSearchAttributes: searchAttributes,
      taskQueue: TEMPORAL_TASK_QUEUE,
      type: "startWorkflow",
      workflowId,
      workflowType: RANK_CHECK_WORKFLOW_TYPE,
    },
    memo: {
      kind: "rank-check",
      keywordId: input.keywordId,
      projectId: input.projectId,
      provider: input.providerId ?? "primary",
    },
    policies: {
      catchupWindow: CATCHUP_WINDOW,
      overlap: ScheduleOverlapPolicy.SKIP,
      pauseOnFailure: false,
    },
    scheduleId: rankCheckScheduleId(input.keywordId),
    typedSearchAttributes: searchAttributes,
    spec: buildRankCheckScheduleSpec(input.schedule, input.keywordId),
    state: { note: "Rank check schedule active", paused: false },
  };
}

function buildRankCheckScheduleUpdate(input: SyncRankCheckScheduleInput): RankCheckScheduleUpdate {
  const options = buildRankCheckScheduleOptions(input);

  return {
    action: options.action,
    policies: options.policies,
    typedSearchAttributes: options.typedSearchAttributes,
    spec: options.spec,
    state: { note: options.state?.note, paused: options.state?.paused },
  };
}

function isScheduleAlreadyRunning(error: unknown) {
  return (
    error instanceof ScheduleAlreadyRunning ||
    (error as { name?: string }).name === "ScheduleAlreadyRunning"
  );
}

function isScheduleNotFound(error: unknown) {
  return (
    error instanceof ScheduleNotFoundError ||
    (error as { name?: string }).name === "ScheduleNotFoundError"
  );
}

async function scheduleClient(client?: TemporalScheduleClient) {
  if (client) {
    return client;
  }

  return (await getTemporalClient()).schedule;
}

function requireLegacyScheduleWriter() {
  if (!legacySchedulingAllowed()) {
    throw new Error("Owned per-keyword Schedule mutation is disabled outside legacy mode.");
  }
}

export async function upsertRankCheckSchedule(
  input: SyncRankCheckScheduleInput,
  client?: TemporalScheduleClient,
): Promise<SyncRankCheckScheduleResult> {
  requireLegacyScheduleWriter();
  const temporal = await scheduleClient(client);
  const options = buildRankCheckScheduleOptions(input);

  try {
    await temporal.create(options);
    return {
      scheduleId: options.scheduleId,
      status: "created",
      workflowId: options.action.workflowId,
    };
  } catch (error) {
    if (!isScheduleAlreadyRunning(error)) {
      throw error;
    }
  }

  await temporal.getHandle(options.scheduleId).update(() => buildRankCheckScheduleUpdate(input));

  return {
    scheduleId: options.scheduleId,
    status: "updated",
    workflowId: options.action.workflowId,
  };
}

export async function deleteRankCheckSchedule(
  keywordId: string,
  client?: TemporalScheduleClient,
): Promise<SyncRankCheckScheduleResult> {
  requireLegacyScheduleWriter();
  const temporal = await scheduleClient(client);
  const scheduleId = rankCheckScheduleId(keywordId);

  try {
    await temporal.getHandle(scheduleId).delete();
    return { scheduleId, status: "deleted", workflowId: rankCheckWorkflowId(keywordId) };
  } catch (error) {
    if (isScheduleNotFound(error)) {
      return { scheduleId, status: "missing", workflowId: rankCheckWorkflowId(keywordId) };
    }
    throw error;
  }
}

export async function syncRankCheckSchedule(
  input: SyncRankCheckScheduleInput,
  client?: TemporalScheduleClient,
): Promise<SyncRankCheckScheduleResult> {
  if (!isScheduledFrequency(input.schedule.frequency)) {
    return deleteRankCheckSchedule(input.keywordId, client);
  }

  return upsertRankCheckSchedule(input, client);
}

export async function syncRankCheckScheduleNonFatal(
  input: SyncRankCheckScheduleInput,
  client?: TemporalScheduleClient,
): Promise<SyncRankCheckScheduleResult | null> {
  try {
    return await syncRankCheckSchedule(input, client);
  } catch (error) {
    console.error("[temporal] rank-check schedule sync failed", {
      error,
      keywordId: input.keywordId,
      projectId: input.projectId,
      scheduleId: rankCheckScheduleId(input.keywordId),
    });
    return null;
  }
}
