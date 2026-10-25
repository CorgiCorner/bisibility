import { proxyActivities } from "@temporalio/workflow";
import type { checkNotificationSummariesActivity as Activity } from "./check-summary-maintenance-activity";

const { checkNotificationSummariesActivity } = proxyActivities<{
  checkNotificationSummariesActivity: typeof Activity;
}>({
  startToCloseTimeout: "5 minutes",
  retry: { initialInterval: "5 seconds", maximumAttempts: 3 },
});

export async function checkNotificationSummariesWorkflow() {
  return checkNotificationSummariesActivity();
}
