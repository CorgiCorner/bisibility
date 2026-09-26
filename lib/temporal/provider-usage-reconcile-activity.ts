import "server-only";

import {
  type ProviderUsageReconciliationResult,
  reconcileProviderUsage,
} from "../provider-usage/reconcile";
import { isScheduledMaintenanceEnabled } from "./maintenance-schedule-bootstrap";

export type ProviderUsageReconciliationActivityResult =
  | ProviderUsageReconciliationResult
  | { status: "skipped" };

export async function reconcileProviderUsageActivity(): Promise<ProviderUsageReconciliationActivityResult> {
  if (!isScheduledMaintenanceEnabled()) return { status: "skipped" };
  return reconcileProviderUsage();
}
