import { WorkflowExecutionAlreadyStartedError, WorkflowIdReusePolicy } from "@temporalio/common";
import { ParentClosePolicy, startChild } from "@temporalio/workflow";
import { RANK_CHECK_DISPATCHER_SCHEDULE_ID } from "../rank-check/dispatcher-constants";
import { queuedBatchWorkflowId } from "../rank-check/queued-batches";
import { RANK_CHECK_WORKFLOW_TYPE, rankCheckWorkflowId } from "../rank-check/workflow-id";
import type { QueuedRankCheckWorkflowInput } from "./queued-rank-check-contract";
import {
  queuedRankCheckSearchAttributes,
  rankCheckSearchAttributes,
} from "./rank-check-search-attributes";
import type {
  RankCheckWorkflowInput,
  RankCheckWorkflowResult,
} from "./rank-check-workflow-contract";

type RankCheckWorkflow = (input: RankCheckWorkflowInput) => Promise<RankCheckWorkflowResult>;

export type DispatcherStartOutcome = {
  count: number;
  status: "already_started" | "failed" | "started";
};

const QUEUED_RANK_CHECK_WORKFLOW_TYPE = "queuedRankCheckBatchWorkflow";

function isAlreadyRunning(error: unknown) {
  return (
    error instanceof WorkflowExecutionAlreadyStartedError ||
    (error as { name?: string })?.name === "WorkflowExecutionAlreadyStartedError"
  );
}

export async function startRankCheckChild(
  keywordId: string,
  projectId: string,
  claimedAt: string,
): Promise<DispatcherStartOutcome> {
  try {
    await startChild<RankCheckWorkflow>(RANK_CHECK_WORKFLOW_TYPE, {
      args: [
        {
          dispatch: {
            scheduleId: RANK_CHECK_DISPATCHER_SCHEDULE_ID,
            scheduledAt: claimedAt,
          },
          keywordId,
        },
      ],
      parentClosePolicy: ParentClosePolicy.ABANDON,
      typedSearchAttributes: rankCheckSearchAttributes({ keywordId, projectId }),
      workflowId: rankCheckWorkflowId(keywordId),
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
    });
    return { count: 1, status: "started" };
  } catch (error) {
    return { count: 1, status: isAlreadyRunning(error) ? "already_started" : "failed" };
  }
}

export async function startQueuedBatchChild(
  input: QueuedRankCheckWorkflowInput,
): Promise<DispatcherStartOutcome> {
  try {
    await startChild(QUEUED_RANK_CHECK_WORKFLOW_TYPE, {
      args: [input],
      parentClosePolicy: ParentClosePolicy.ABANDON,
      typedSearchAttributes: queuedRankCheckSearchAttributes(input.projectId),
      workflowId: queuedBatchWorkflowId(input),
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
    });
    return { count: input.keywordIds.length, status: "started" };
  } catch (error) {
    return {
      count: input.keywordIds.length,
      status: isAlreadyRunning(error) ? "already_started" : "failed",
    };
  }
}
