import { proxyActivities } from "@temporalio/workflow";

export type OpsHeartbeatWorkflowResult = {
  prunedEvents: number;
  prunedRuns: number;
  status: "completed" | "disabled";
  sweepAttempted: number;
  sweepDelivered: number;
};

type OpsActivities = {
  opsHeartbeatActivity(): Promise<OpsHeartbeatWorkflowResult>;
};

const { opsHeartbeatActivity } = proxyActivities<OpsActivities>({
  retry: {
    backoffCoefficient: 2,
    initialInterval: "5 seconds",
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
  startToCloseTimeout: "30 minutes",
});

export async function opsHeartbeatWorkflow(): Promise<OpsHeartbeatWorkflowResult> {
  return opsHeartbeatActivity();
}
