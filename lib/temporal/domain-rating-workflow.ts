import { continueAsNew, proxyActivities } from "@temporalio/workflow";
import type { collectDomainRatingBatchActivity } from "./domain-rating-activity";

const activities = proxyActivities<{
  collectDomainRatingBatchActivity: typeof collectDomainRatingBatchActivity;
}>({
  startToCloseTimeout: "10 minutes",
  retry: { maximumAttempts: 3 },
});

export async function collectDomainRatingsWorkflow(cursor: string | null = null): Promise<void> {
  const next = await activities.collectDomainRatingBatchActivity(cursor);
  if (next) await continueAsNew<typeof collectDomainRatingsWorkflow>(next);
}
