import "server-only";

import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from "@temporalio/common";
import { launchDuePlannedRuns } from "../rank-check/planner/launch-due";
import { planRankCheckRuns } from "../rank-check/planner/plan";
import { isAlreadyStarted, RANK_CHECK_RUN_WORKFLOW_TYPE } from "../rank-check/workflow-id";
import { TEMPORAL_TASK_QUEUE } from "./deployment-config";
import { getSchedulerTemporalClient } from "./scheduler-client";

export type PlanRankCheckRunsActivityInput = {
  cursor: string | null;
  limit: number;
  now: string;
};

export async function planRankCheckRunsActivity(input: PlanRankCheckRunsActivityInput) {
  return planRankCheckRuns({ cursor: input.cursor, limit: input.limit, now: new Date(input.now) });
}

async function startRun(input: { runId: string; workflowId: string }) {
  const client = await getSchedulerTemporalClient();
  try {
    await client.workflow.start(RANK_CHECK_RUN_WORKFLOW_TYPE, {
      args: [{ runId: input.runId }],
      taskQueue: TEMPORAL_TASK_QUEUE,
      workflowId: input.workflowId,
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.FAIL,
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
    });
  } catch (error) {
    if (!isAlreadyStarted(error)) throw error;
    return { alreadyExists: true };
  }
  return { alreadyExists: false };
}

export function launchDuePlannedRunsActivity(input: {
  cursor: { id: string; plannedFor: string } | null;
  limit: number;
  now: string;
}) {
  return launchDuePlannedRuns({
    cursor: input.cursor,
    limit: input.limit,
    now: new Date(input.now),
    startRun,
  });
}
