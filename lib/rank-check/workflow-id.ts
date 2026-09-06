import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";

export const RANK_CHECK_RUN_WORKFLOW_TYPE = "rankCheckRunWorkflow";
export const RANK_CHECK_WORKFLOW_TYPE = "rankCheckWorkflow";

export function rankCheckWorkflowId(keywordId: string) {
  return `rank-check-${keywordId}`;
}

export function isAlreadyStarted(error: unknown) {
  return (
    error instanceof WorkflowExecutionAlreadyStartedError ||
    (error as { name?: string })?.name === "WorkflowExecutionAlreadyStartedError"
  );
}
