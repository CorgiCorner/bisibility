// Temporal sandbox module: imports only deterministic workflow packages and types.
import {
  ActivityCancellationType,
  CancellationScope,
  continueAsNew,
  isCancellation,
  proxyActivities,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";
import type { QueuedRankCheckModeAuthorization } from "../rank-check/queued-mode";
import {
  QUEUED_DEADLINE_REASON,
  QUEUED_INSPECTION_ACTIVITY_HEARTBEAT_TIMEOUT,
  QUEUED_INSPECTION_ACTIVITY_START_TO_CLOSE,
  QUEUED_INSPECTION_CANCELLATION_REASON,
  QUEUED_RESULT_ACTIVITY_HEARTBEAT_TIMEOUT,
  QUEUED_RESULT_ACTIVITY_START_TO_CLOSE,
} from "../rank-check/queued-timeouts";
import type {
  PreparedQueuedBatch,
  QueuedBatchInspection,
  QueuedBatchProgress,
  QueuedRankCheckWorkflowInput,
} from "./queued-rank-check-contract";

const POLLS_PER_RUN = 20;

type LifecycleActivities = {
  authorizeQueuedRankCheckBatchActivity(input: {
    batchId: string;
  }): Promise<QueuedRankCheckModeAuthorization>;
  prepareQueuedRankCheckBatchActivity(
    input: QueuedRankCheckWorkflowInput & { batchId: string; workflowRunId: string },
  ): Promise<PreparedQueuedBatch>;
  timeoutQueuedRankCheckBatchActivity(input: {
    batchId: string;
    reason: string;
  }): Promise<QueuedBatchProgress>;
  queuedRankCheckBatchProgressActivity(input: { batchId: string }): Promise<QueuedBatchProgress>;
};

type SubmissionActivities = {
  submitQueuedRankCheckBatchActivity(input: { batchId: string }): Promise<{ state: string }>;
};

type InspectionActivities = {
  inspectQueuedRankCheckBatchActivity(input: {
    batchId: string;
    deadlineAt: string;
  }): Promise<QueuedBatchInspection>;
};

type ResultActivities = {
  persistReadyQueuedRankCheckTasksActivity(input: {
    batchId: string;
    deadlineAt: string;
  }): Promise<QueuedBatchProgress>;
};

const {
  authorizeQueuedRankCheckBatchActivity,
  prepareQueuedRankCheckBatchActivity,
  queuedRankCheckBatchProgressActivity,
  timeoutQueuedRankCheckBatchActivity,
} = proxyActivities<LifecycleActivities>({
  retry: {
    backoffCoefficient: 2,
    initialInterval: "5 seconds",
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
  startToCloseTimeout: "1 minute",
});

const { submitQueuedRankCheckBatchActivity } = proxyActivities<SubmissionActivities>({
  retry: {
    backoffCoefficient: 2,
    initialInterval: "5 seconds",
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
  startToCloseTimeout: "45 seconds",
});

const { inspectQueuedRankCheckBatchActivity } = proxyActivities<InspectionActivities>({
  cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
  heartbeatTimeout: QUEUED_INSPECTION_ACTIVITY_HEARTBEAT_TIMEOUT,
  retry: {
    backoffCoefficient: 2,
    initialInterval: "5 seconds",
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
  startToCloseTimeout: QUEUED_INSPECTION_ACTIVITY_START_TO_CLOSE,
});

const { persistReadyQueuedRankCheckTasksActivity } = proxyActivities<ResultActivities>({
  heartbeatTimeout: QUEUED_RESULT_ACTIVITY_HEARTBEAT_TIMEOUT,
  retry: {
    backoffCoefficient: 2,
    initialInterval: "5 seconds",
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
  startToCloseTimeout: QUEUED_RESULT_ACTIVITY_START_TO_CLOSE,
});

function queueExpired(startedAt: string, maxQueueAgeSeconds: number) {
  return Date.now() - Date.parse(startedAt) >= maxQueueAgeSeconds * 1000;
}

function timeoutReason(state: string) {
  return state === "ambiguous" || state === "submitting"
    ? "DataForSEO submission remained ambiguous until the queue-age limit; no task was resubmitted."
    : QUEUED_DEADLINE_REASON;
}

function cleanupCancelledInspection(batchId: string) {
  return CancellationScope.nonCancellable(() =>
    timeoutQueuedRankCheckBatchActivity({
      batchId,
      reason: QUEUED_INSPECTION_CANCELLATION_REASON,
    }),
  );
}

export async function queuedRankCheckBatchWorkflow(
  input: QueuedRankCheckWorkflowInput,
): Promise<QueuedBatchProgress> {
  const info = workflowInfo();
  const batchId = input.batchId ?? info.workflowId;
  const authorization = await authorizeQueuedRankCheckBatchActivity({ batchId });
  if (!authorization.allowPrepare) {
    return { completed: 0, failed: 0, pending: 0, state: "deferred" };
  }
  const prepared = await prepareQueuedRankCheckBatchActivity({
    ...input,
    batchId,
    workflowRunId: info.runId,
  });
  if (prepared.persisted === false) {
    return { completed: 0, failed: 0, pending: 0, state: "deferred" };
  }
  const startedAt = input.startedAt ?? prepared.startedAt;
  const deadlineAt = new Date(
    Date.parse(startedAt) + prepared.maxQueueAgeSeconds * 1000,
  ).toISOString();
  let polls = input.polls ?? 0;

  if (
    prepared.state === "completed" ||
    prepared.state === "deferred" ||
    prepared.state === "failed"
  ) {
    return queuedRankCheckBatchProgressActivity({ batchId: prepared.batchId });
  }

  let lastKnownState = prepared.state;
  let deadlineReached = queueExpired(startedAt, prepared.maxQueueAgeSeconds);
  if (!deadlineReached && authorization.allowSubmit) {
    const submitted = await submitQueuedRankCheckBatchActivity({ batchId: prepared.batchId });
    lastKnownState = submitted.state;
  } else if (!deadlineReached && prepared.state === "prepared") {
    return timeoutQueuedRankCheckBatchActivity({
      batchId: prepared.batchId,
      reason: `Queued provider submission is disabled in ${authorization.mode} scheduler mode.`,
    });
  } else if (!deadlineReached && !authorization.allowPaidRetrieval) {
    return timeoutQueuedRankCheckBatchActivity({
      batchId: prepared.batchId,
      reason: `Queued provider execution is disabled in ${authorization.mode} scheduler mode.`,
    });
  }

  while (true) {
    deadlineReached = deadlineReached || queueExpired(startedAt, prepared.maxQueueAgeSeconds);
    if (deadlineReached) {
      const progress = await timeoutQueuedRankCheckBatchActivity({
        batchId: prepared.batchId,
        reason: timeoutReason(lastKnownState),
      });
      lastKnownState = progress.state;
      if (progress.pending === 0) return progress;
    } else {
      let inspection: QueuedBatchInspection;
      try {
        inspection = await inspectQueuedRankCheckBatchActivity({
          batchId: prepared.batchId,
          deadlineAt,
        });
      } catch (error) {
        if (!isCancellation(error)) throw error;
        return cleanupCancelledInspection(prepared.batchId);
      }
      lastKnownState = inspection.state;
      if (inspection.deadlineReached) {
        deadlineReached = true;
        continue;
      }
      deadlineReached = queueExpired(startedAt, prepared.maxQueueAgeSeconds);
      if (deadlineReached) continue;
      if (inspection.ready > 0) {
        const progress = await persistReadyQueuedRankCheckTasksActivity({
          batchId: prepared.batchId,
          deadlineAt,
        });
        if (progress.pending === 0) return progress;
        deadlineReached = queueExpired(startedAt, prepared.maxQueueAgeSeconds);
        if (deadlineReached) continue;
      } else if (inspection.pending === 0 && inspection.ambiguous === 0) {
        return {
          completed: inspection.terminal,
          failed: 0,
          pending: 0,
          state: inspection.state,
        };
      }
    }

    polls += 1;
    if (polls > 0 && polls % POLLS_PER_RUN === 0) {
      return continueAsNew<typeof queuedRankCheckBatchWorkflow>({
        ...input,
        batchId: prepared.batchId,
        polls,
        startedAt,
      });
    }
    await sleep(`${prepared.pollIntervalSeconds} seconds`);
  }
}
