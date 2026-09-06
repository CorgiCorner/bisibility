import "server-only";

import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from "@temporalio/common";
import type { FirstTrafficSyncIntentClaim } from "../traffic/first-sync-intent-claim";
import { TEMPORAL_TASK_QUEUE } from "./client";
import { getSchedulerTemporalClient } from "./scheduler-client";
import {
  FIRST_TRAFFIC_SYNC_WORKFLOW_TYPE,
  type FirstTrafficSyncWorkflowInput,
} from "./traffic-first-sync-contract";

export function firstTrafficSyncWorkflowId(claim: FirstTrafficSyncIntentClaim) {
  return `traffic-first-sync:${claim.id}:${claim.firstSyncStartedAt.getTime()}`;
}

function workflowInput(claim: FirstTrafficSyncIntentClaim): FirstTrafficSyncWorkflowInput {
  return {
    connectionId: claim.id,
    firstSyncRequestedAt: claim.firstSyncRequestedAt.toISOString(),
    firstSyncStartedAt: claim.firstSyncStartedAt.toISOString(),
    projectId: claim.projectId,
    reclaimed: claim.reclaimed,
  };
}

export async function startFirstTrafficSyncWorkflow(claim: FirstTrafficSyncIntentClaim) {
  const client = await getSchedulerTemporalClient();
  const handle = await client.workflow.start(FIRST_TRAFFIC_SYNC_WORKFLOW_TYPE, {
    args: [workflowInput(claim)],
    taskQueue: TEMPORAL_TASK_QUEUE,
    workflowId: firstTrafficSyncWorkflowId(claim),
    workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
    workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
  });
  return { runId: handle.firstExecutionRunId, workflowId: handle.workflowId };
}
