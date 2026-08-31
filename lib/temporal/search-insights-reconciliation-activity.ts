import "server-only";

import {
  type QueuedImportReconciliationResult,
  reconcileQueuedSearchInsightsImports,
} from "../search-insights/sync/queued-import-reconciler";

export type SearchInsightsQueueReconciliationActivityResult = QueuedImportReconciliationResult;

export async function reconcileQueuedSearchInsightsImportsActivity() {
  return reconcileQueuedSearchInsightsImports();
}
