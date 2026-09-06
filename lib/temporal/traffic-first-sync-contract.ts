export const FIRST_TRAFFIC_SYNC_WORKFLOW_TYPE = "syncFirstTrafficWorkflow";

export type FirstTrafficSyncWorkflowInput = {
  connectionId: string;
  firstSyncRequestedAt: string;
  firstSyncStartedAt: string;
  projectId: string;
  reclaimed: boolean;
};
