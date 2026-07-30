import "server-only";

import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from "@temporalio/common";
import { getTemporalClient, TEMPORAL_TASK_QUEUE } from "./client";
import { TRAFFIC_SYNC_SCHEDULE_ID, TRAFFIC_SYNC_WORKFLOW_TYPE } from "./traffic-bootstrap";

/** Start the singleton traffic workflow, or reuse the currently running execution. */
export async function startTrafficSyncWorkflow() {
  const client = await getTemporalClient();
  const handle = await client.workflow.start(TRAFFIC_SYNC_WORKFLOW_TYPE, {
    args: [],
    taskQueue: TEMPORAL_TASK_QUEUE,
    workflowId: TRAFFIC_SYNC_SCHEDULE_ID,
    workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
    workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
  });
  return { runId: handle.firstExecutionRunId, workflowId: handle.workflowId };
}
