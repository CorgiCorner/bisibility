import { proxyActivities } from "@temporalio/workflow";
import type { SearchInsightsQueueReconciliationActivityResult } from "./search-insights-reconciliation-activity";

type ReconciliationActivities = {
  reconcileQueuedSearchInsightsImportsActivity(): Promise<SearchInsightsQueueReconciliationActivityResult>;
};

const { reconcileQueuedSearchInsightsImportsActivity } = proxyActivities<ReconciliationActivities>({
  retry: {
    backoffCoefficient: 2,
    initialInterval: "5 seconds",
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
  startToCloseTimeout: "2 minutes",
});

export async function reconcileQueuedSearchInsightsImportsWorkflow() {
  return reconcileQueuedSearchInsightsImportsActivity();
}
