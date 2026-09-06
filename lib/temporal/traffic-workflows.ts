// Pure, deterministic workflow code. Keep provider and Prisma work inside the
// activity so the workflow sandbox only coordinates retries and timeouts.
import { proxyActivities } from "@temporalio/workflow";
import type {
  FirstTrafficSyncWorkflowInput,
  SyncTrafficActivityResult,
} from "./traffic-activities";

type TrafficActivities = {
  syncFirstTrafficIntentActivity(input: FirstTrafficSyncWorkflowInput): Promise<unknown>;
  syncTrafficActivity(): Promise<SyncTrafficActivityResult>;
};

const { syncFirstTrafficIntentActivity, syncTrafficActivity } = proxyActivities<TrafficActivities>({
  retry: {
    backoffCoefficient: 2,
    initialInterval: "5 seconds",
    maximumAttempts: 3,
    maximumInterval: "1 minute",
  },
  startToCloseTimeout: "30 minutes",
});

export type SyncTrafficWorkflowResult = SyncTrafficActivityResult;

export async function syncTrafficWorkflow(): Promise<SyncTrafficWorkflowResult> {
  return syncTrafficActivity();
}

export async function syncFirstTrafficWorkflow(input: FirstTrafficSyncWorkflowInput) {
  return syncFirstTrafficIntentActivity(input);
}
