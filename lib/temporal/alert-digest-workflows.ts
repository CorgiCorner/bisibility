// This workflow stays sandbox-pure; the activity owns database and delivery side effects.
import { proxyActivities } from "@temporalio/workflow";
import type { FlushAlertDigestsActivityResult } from "./alert-digest-activities";

type AlertDigestActivities = {
  flushAlertDigestsActivity(): Promise<FlushAlertDigestsActivityResult>;
};

const { flushAlertDigestsActivity } = proxyActivities<AlertDigestActivities>({
  heartbeatTimeout: "1 minute",
  retry: { maximumAttempts: 3 },
  startToCloseTimeout: "5 minutes",
});

export async function flushAlertDigestsWorkflow(): Promise<FlushAlertDigestsActivityResult> {
  return flushAlertDigestsActivity();
}
