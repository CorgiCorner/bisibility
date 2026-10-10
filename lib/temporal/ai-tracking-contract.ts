export type AiTrackingWorkflowInput = {
  projectId: string;
  runId: string;
  polls?: number;
  collectionOnly?: boolean;
};
export type AiTrackingProgress = {
  pending: number;
  unknown: number;
  terminal: number;
  deadline: string | null;
};
