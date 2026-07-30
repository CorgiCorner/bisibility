import "server-only";

import { Context } from "@temporalio/activity";
import type { ClaimedRankCheckGroup } from "../rank-check/dispatcher-types";
import { inspectQueuedRankCheckBatch } from "../rank-check/queued-inspect";
import { deferQueuedRankCheckBatch, queuedBatchProgress } from "../rank-check/queued-lifecycle";
import { authorizeQueuedRankCheckBatch } from "../rank-check/queued-mode";
import { prepareQueuedRankCheckBatch } from "../rank-check/queued-prepare";
import { persistReadyQueuedRankCheckTasks } from "../rank-check/queued-results";
import { queuedRankCheckRoute } from "../rank-check/queued-routing";
import { submitQueuedRankCheckBatch } from "../rank-check/queued-submit";
import {
  QUEUED_INSPECTION_ACTIVITY_HEARTBEAT_MS,
  QUEUED_RESULT_ACTIVITY_HEARTBEAT_MS,
} from "../rank-check/queued-timeouts";
import type { QueuedRankCheckWorkflowInput } from "./queued-rank-check-contract";

export function planQueuedRankCheckGroupActivity(group: ClaimedRankCheckGroup) {
  return queuedRankCheckRoute(group);
}

export function authorizeQueuedRankCheckBatchActivity(input: { batchId: string }) {
  return authorizeQueuedRankCheckBatch(input.batchId);
}

export async function prepareQueuedRankCheckBatchActivity(
  input: QueuedRankCheckWorkflowInput & { batchId: string; workflowRunId: string },
) {
  const authorization = await authorizeQueuedRankCheckBatch(input.batchId);
  if (!authorization.allowPrepare) {
    return {
      batchId: input.batchId,
      maxQueueAgeSeconds: 1,
      persisted: false,
      pollIntervalSeconds: 1,
      startedAt: new Date().toISOString(),
      state: "deferred",
    };
  }
  return prepareQueuedRankCheckBatch(input);
}

export function submitQueuedRankCheckBatchActivity(input: { batchId: string }) {
  return submitQueuedRankCheckBatch(input.batchId);
}

type InspectQueuedRankCheckBatch = typeof inspectQueuedRankCheckBatch;

async function heartbeatingProviderActivity<T>(
  input: { batchId: string },
  phase: string,
  heartbeatMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
) {
  const context = Context.current();
  const details = { batchId: input.batchId, phase };
  context.heartbeat(details);
  const heartbeat = setInterval(() => context.heartbeat(details), heartbeatMs);
  try {
    const result = await operation(context.cancellationSignal);
    if (context.cancellationSignal.aborted) await context.cancelled;
    return result;
  } catch (error) {
    if (context.cancellationSignal.aborted) await context.cancelled;
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}

export function createInspectQueuedRankCheckBatchActivity(
  inspect: InspectQueuedRankCheckBatch = inspectQueuedRankCheckBatch,
  authorize: typeof authorizeQueuedRankCheckBatch = authorizeQueuedRankCheckBatch,
) {
  return async function inspectQueuedRankCheckBatchActivity(input: {
    batchId: string;
    deadlineAt: string;
  }) {
    const authorization = await authorize(input.batchId);
    if (!authorization.allowPaidRetrieval) {
      return {
        ambiguous: 0,
        deadlineReached: true,
        pending: authorization.existingState ? 1 : 0,
        ready: 0,
        state: authorization.existingState ?? "deferred",
        terminal: 0,
      };
    }
    return heartbeatingProviderActivity(
      input,
      "provider-inspection",
      QUEUED_INSPECTION_ACTIVITY_HEARTBEAT_MS,
      (signal) =>
        inspect(input.batchId, {
          deadlineAt: new Date(input.deadlineAt),
          signal,
        }),
    );
  };
}

export const inspectQueuedRankCheckBatchActivity = createInspectQueuedRankCheckBatchActivity();

export async function persistReadyQueuedRankCheckTasksActivity(input: {
  batchId: string;
  deadlineAt: string;
}) {
  const authorization = await authorizeQueuedRankCheckBatch(input.batchId);
  if (!authorization.allowPaidRetrieval) {
    return deferQueuedRankCheckBatch(
      input.batchId,
      `Queued result retrieval is disabled in ${authorization.mode} scheduler mode.`,
    );
  }
  return heartbeatingProviderActivity(
    input,
    "result-persistence",
    QUEUED_RESULT_ACTIVITY_HEARTBEAT_MS,
    (signal) =>
      persistReadyQueuedRankCheckTasks(input.batchId, {
        deadlineAt: new Date(input.deadlineAt),
        signal,
      }),
  );
}

export function timeoutQueuedRankCheckBatchActivity(input: { batchId: string; reason: string }) {
  return deferQueuedRankCheckBatch(input.batchId, input.reason);
}

export function queuedRankCheckBatchProgressActivity(input: { batchId: string }) {
  return queuedBatchProgress(input.batchId);
}
