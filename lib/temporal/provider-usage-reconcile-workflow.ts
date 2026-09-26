import { continueAsNew, proxyActivities } from "@temporalio/workflow";
import type { ProviderUsageReconciliationActivityResult } from "./provider-usage-reconcile-activity";

type ProviderUsageReconciliationActivities = {
  reconcileProviderUsageActivity(): Promise<ProviderUsageReconciliationActivityResult>;
};

const { reconcileProviderUsageActivity } = proxyActivities<ProviderUsageReconciliationActivities>({
  retry: {
    backoffCoefficient: 2,
    initialInterval: "5 seconds",
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
  startToCloseTimeout: "2 minutes",
});

export async function reconcileProviderUsageWorkflow(): Promise<ProviderUsageReconciliationActivityResult> {
  const result = await reconcileProviderUsageActivity();
  if ("hasMore" in result && result.hasMore) {
    return continueAsNew<typeof reconcileProviderUsageWorkflow>();
  }
  return result;
}
