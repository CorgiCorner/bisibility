import "server-only";
import { WorkflowExecutionAlreadyStartedError, WorkflowIdReusePolicy } from "@temporalio/client";
import type { ModelRunIdentity } from "../model-playground/recovery";
import { TEMPORAL_TASK_QUEUE } from "./deployment-config";
import { getSchedulerTemporalClient } from "./scheduler-client";

export async function startModelPlaygroundWorkflow(input: ModelRunIdentity) {
  try {
    await (await getSchedulerTemporalClient()).workflow.start("modelPlaygroundWorkflow", {
      workflowId: `model-playground:${input.runId}`,
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
      taskQueue: TEMPORAL_TASK_QUEUE,
      args: [input],
    });
  } catch (error) {
    if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
  }
}
