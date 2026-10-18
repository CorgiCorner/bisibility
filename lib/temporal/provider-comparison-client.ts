import "server-only";
import { WorkflowExecutionAlreadyStartedError, WorkflowIdReusePolicy } from "@temporalio/client";
import { TEMPORAL_TASK_QUEUE } from "./deployment-config";
import { getSchedulerTemporalClient } from "./scheduler-client";
export async function startProviderComparisonWorkflow(projectId: string, runId: string) {
  try {
    await (await getSchedulerTemporalClient()).workflow.start("providerComparisonWorkflow", {
      workflowId: `provider-comparison:${runId}`,
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
      taskQueue: TEMPORAL_TASK_QUEUE,
      args: [{ projectId, runId }],
    });
  } catch (error) {
    if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
  }
}
