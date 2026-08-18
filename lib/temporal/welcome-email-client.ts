import "server-only";

import { WorkflowExecutionAlreadyStartedError, WorkflowIdReusePolicy } from "@temporalio/common";
import { TEMPORAL_TASK_QUEUE } from "./client";
import { getSchedulerTemporalClient } from "./scheduler-client";

export const WELCOME_FOLLOWUP_WORKFLOW_TYPE = "welcomeFollowupWorkflow";

export function welcomeFollowupWorkflowId(userId: string) {
  return `welcome-followup-${userId}`;
}

export async function startWelcomeFollowupWorkflow(userId: string) {
  const client = await getSchedulerTemporalClient();
  try {
    await client.workflow.start(WELCOME_FOLLOWUP_WORKFLOW_TYPE, {
      args: [{ userId }],
      taskQueue: TEMPORAL_TASK_QUEUE,
      workflowId: welcomeFollowupWorkflowId(userId),
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
    });
  } catch (error) {
    if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
  }
}
