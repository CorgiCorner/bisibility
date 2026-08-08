// Temporal sandbox module: no Prisma, providers, Node built-ins, or side effects.
// Only deterministic Temporal packages and type-only activity imports are allowed.
import { defineSearchAttributeKey, SearchAttributeType } from "@temporalio/common";
import { ApplicationFailure, proxyActivities, workflowInfo } from "@temporalio/workflow";
import { RANK_CHECK_DISPATCHER_SCHEDULE_ID } from "../rank-check/dispatcher-constants";
import { DEFAULT_STALE_RUNNING_CHECK_MINUTES } from "../rank-check/stale-window";
import { rankCheckWorkflowId } from "../rank-check/workflow-id";
import type {
  AuthorizeRankCheckExecutionInput,
  AuthorizeRankCheckExecutionResult,
  CreateRunningRankCheckActivityInput,
  DiscardRankCheckActivityInput,
  FailRankCheckActivityInput,
  FailRankCheckActivityResult,
  RankCheckActivitySuccess,
  RunningRankCheckActivityResult,
  RunRankCheckActivityInput,
} from "./rank-check-activities";
import {
  AUTOMATIC_EXECUTION_DISABLED_FAILURE,
  BUDGET_EXHAUSTED_FAILURE,
  PROJECT_READ_ONLY_FAILURE,
  PROVIDER_RATE_LIMITED_FAILURE,
  RANK_CHECK_CLOSED_FAILURE,
} from "./rank-check-activity-contract";
import type {
  RankCheckWorkflowInput,
  RankCheckWorkflowResult,
} from "./rank-check-workflow-contract";

export const RANK_CHECK_QUEUE_LEASE_MARGIN_MINUTES = 1;
export const RANK_CHECK_SCHEDULE_TO_START_TIMEOUT_MINUTES =
  DEFAULT_STALE_RUNNING_CHECK_MINUTES - RANK_CHECK_QUEUE_LEASE_MARGIN_MINUTES;
export const RANK_CHECK_SCHEDULE_TO_START_TIMEOUT = `${RANK_CHECK_SCHEDULE_TO_START_TIMEOUT_MINUTES} minutes`;
export const RANK_CHECK_START_TO_CLOSE_TIMEOUT = "15 minutes";
const DEFERRED_FAILURE_TYPES = new Set([
  AUTOMATIC_EXECUTION_DISABLED_FAILURE,
  PROVIDER_RATE_LIMITED_FAILURE,
  PROJECT_READ_ONLY_FAILURE,
  BUDGET_EXHAUSTED_FAILURE,
]);

type RankCheckActivities = {
  runRankCheckActivity(input: RunRankCheckActivityInput): Promise<RankCheckActivitySuccess>;
};

type RankCheckLifecycleActivities = {
  authorizeRankCheckExecutionActivity(
    input: AuthorizeRankCheckExecutionInput,
  ): Promise<AuthorizeRankCheckExecutionResult>;
  createRunningRankCheckActivity(
    input: CreateRunningRankCheckActivityInput,
  ): Promise<RunningRankCheckActivityResult>;
  discardRankCheckActivity(input: DiscardRankCheckActivityInput): Promise<{ rankCheckId: string }>;
  failRankCheckActivity(input: FailRankCheckActivityInput): Promise<FailRankCheckActivityResult>;
};

const temporalScheduledStartTime = defineSearchAttributeKey(
  "TemporalScheduledStartTime",
  SearchAttributeType.DATETIME,
);
const temporalScheduledById = defineSearchAttributeKey(
  "TemporalScheduledById",
  SearchAttributeType.KEYWORD,
);

// An activity failure reaches the workflow wrapped in an ActivityFailure whose
// `cause` is the original ApplicationFailure; unwrap one level to classify it.
function applicationFailure(error: unknown) {
  const candidates = [error, (error as { cause?: unknown })?.cause];
  return (
    candidates.find(
      (candidate): candidate is ApplicationFailure => candidate instanceof ApplicationFailure,
    ) ?? null
  );
}

function deferredFailureType(error: unknown): string | null {
  return applicationFailure(error)?.type ?? null;
}

function failureMessage(error: unknown) {
  return (
    applicationFailure(error)?.message ??
    (error instanceof Error ? error.message : "Rank check failed.")
  );
}

const { runRankCheckActivity } = proxyActivities<RankCheckActivities>({
  retry: {
    backoffCoefficient: 2,
    initialInterval: "5 seconds",
    maximumAttempts: 5,
    maximumInterval: "1 minute",
  },
  scheduleToStartTimeout: RANK_CHECK_SCHEDULE_TO_START_TIMEOUT,
  startToCloseTimeout: RANK_CHECK_START_TO_CLOSE_TIMEOUT,
});

const {
  authorizeRankCheckExecutionActivity,
  createRunningRankCheckActivity,
  discardRankCheckActivity,
  failRankCheckActivity,
} = proxyActivities<RankCheckLifecycleActivities>({
  retry: {
    backoffCoefficient: 2,
    initialInterval: "5 seconds",
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
  startToCloseTimeout: "30 seconds",
});

export {
  alertDeliveryWorkflow,
  alertDigestDeliveryWorkflow,
  sweepAlertDeliveriesWorkflow,
} from "./alert-delivery-workflows";
export { flushAlertDigestsWorkflow } from "./alert-digest-workflows";
// Register the worker-owned maintenance workflows in the same sandbox bundle so
// their schedules can start them by name.
export {
  alertHealthWorkflow,
  markStaleImportJobsWorkflow,
  markStaleRunningChecksWorkflow,
  processQueuedJobsWorkflow,
  purgeAuditLogsWorkflow,
  purgeExpiredSessionsWorkflow,
  purgeQueuedRankCheckBatchesWorkflow,
  purgeRankCheckRawPayloadsWorkflow,
  QUEUED_FAILURE_BATCH_ID_SAMPLE_LIMIT,
  RANK_CHECK_RAW_PURGE_ACTIVITY_OPTIONS,
  releaseExpiredMigrationHoldsWorkflow,
  sendWeeklyReportDigestWorkflow,
  syncPresenceWorkflow,
  syncSitemapsWorkflow,
} from "./maintenance-workflows";
export { opsHeartbeatWorkflow } from "./ops-workflows";
export { queuedRankCheckBatchWorkflow } from "./queued-rank-check-workflow";
export {
  bootstrapRankCheckDispatcherWorkflow,
  dispatchDueRankChecksWorkflow,
} from "./rank-check-dispatcher-workflows";
// Re-export into workflowsPath so the worker can resolve the reconciler by name
// inside the same sandbox bundle.
export { reconcileRankCheckSchedulesWorkflow } from "./reconcile-workflows";
export { syncTrafficWorkflow } from "./traffic-workflows";
export type { RankCheckWorkflowInput, RankCheckWorkflowResult };

export function classifyRankCheckExecutionSource(input: {
  dispatchScheduleId: string | null;
  keywordId: string;
  scheduledById: string | null;
}): AuthorizeRankCheckExecutionInput["source"] {
  if (
    input.dispatchScheduleId === RANK_CHECK_DISPATCHER_SCHEDULE_ID &&
    input.scheduledById === null
  ) {
    return "dispatcher";
  }
  if (input.dispatchScheduleId !== null) return "ambiguous";
  if (input.scheduledById === rankCheckWorkflowId(input.keywordId)) return "legacy";
  return input.scheduledById === null ? "manual" : "ambiguous";
}

/**
 * Durable rank check: delegates the side-effecting work (provider call +
 * persistence) to an activity so Temporal can retry it safely on failure.
 */
export async function rankCheckWorkflow(
  input: RankCheckWorkflowInput,
): Promise<RankCheckWorkflowResult> {
  const info = workflowInfo();
  const { dispatch, ...activityInput } = input;
  const scheduledAt =
    info.typedSearchAttributes.get(temporalScheduledStartTime) ??
    (dispatch ? new Date(dispatch.scheduledAt) : null);
  const scheduleId =
    info.typedSearchAttributes.get(temporalScheduledById) ?? dispatch?.scheduleId ?? null;
  const source = classifyRankCheckExecutionSource({
    dispatchScheduleId: dispatch?.scheduleId ?? null,
    keywordId: input.keywordId,
    scheduledById: info.typedSearchAttributes.get(temporalScheduledById) ?? null,
  });
  const authorization = await authorizeRankCheckExecutionActivity({
    keywordId: input.keywordId,
    scheduleId,
    source,
  });
  if (!authorization.allowed) {
    return {
      deferred: true,
      keywordId: input.keywordId,
      reason: authorization.reason ?? "automatic_rank_check_disabled",
    };
  }
  const running = await createRunningRankCheckActivity({
    ...activityInput,
    scheduleId,
    scheduledAt,
    trigger: source === "manual" ? "manual" : "scheduled",
    workflowRunId: info.runId,
  });
  const runInput = { ...activityInput, rankCheckId: running.rankCheckId, source };

  try {
    return await runRankCheckActivity(runInput);
  } catch (error) {
    // Deferred checks leave no running junk row and keep nextCheckAt unchanged.
    const failureType = deferredFailureType(error);
    if (failureType === RANK_CHECK_CLOSED_FAILURE) {
      return {
        deferred: true,
        keywordId: input.keywordId,
        reason: failureMessage(error),
      };
    }
    if (failureType && DEFERRED_FAILURE_TYPES.has(failureType)) {
      const reason =
        failureType === PROJECT_READ_ONLY_FAILURE
          ? "Project is in read-only mode."
          : failureMessage(error);
      await discardRankCheckActivity({ rankCheckId: running.rankCheckId, reason });
      return {
        deferred: true,
        keywordId: input.keywordId,
        reason,
      };
    }

    await failRankCheckActivity({
      keywordId: input.keywordId,
      message: failureMessage(error),
      providerId: input.providerId,
      rankCheckId: running.rankCheckId,
    });
    throw error;
  }
}
