export const RANK_CHECK_WORKFLOW_TYPE = "rankCheckWorkflow";

export function rankCheckWorkflowId(keywordId: string) {
  return `rank-check-${keywordId}`;
}
