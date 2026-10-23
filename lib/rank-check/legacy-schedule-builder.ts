import "server-only";

import {
  RANK_CHECK_WORKFLOW_TYPE,
  rankCheckSearchAttributes,
  rankCheckWorkflowId,
  TEMPORAL_TASK_QUEUE,
} from "@/lib/temporal/client";
import type { RankCheckWorkflowInput, RankCheckWorkflowResult } from "@/lib/temporal/workflows";
import { type ScheduleOptions, ScheduleOverlapPolicy } from "@temporalio/client";
import { monthlyCronExpression as cronExpressionForMonthlyAnchor } from "./cron";
import { DAILY_INTERVAL_MS, stableIntervalPhaseMs, WEEKLY_INTERVAL_MS } from "./interval-phase";
import { isScheduledFrequency, type RankCheckScheduleInput } from "./schedule";

type RankCheckWorkflow = (input: RankCheckWorkflowInput) => Promise<RankCheckWorkflowResult>;
type RankCheckScheduleOptions = ScheduleOptions<{
  type: "startWorkflow";
  workflowType: string | RankCheckWorkflow;
  taskQueue: string;
  workflowId: string;
  args: [RankCheckWorkflowInput];
  typedSearchAttributes: ReturnType<typeof rankCheckSearchAttributes>;
}>;
export type SyncRankCheckScheduleInput = {
  keywordId: string;
  projectId: string;
  providerId?: string;
  schedule: RankCheckScheduleInput;
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
