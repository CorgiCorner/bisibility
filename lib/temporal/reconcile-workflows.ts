// Temporal sandbox module: no Prisma, client, Node built-ins, or side effects.
// Only `@temporalio/workflow` and type-only activity imports are allowed.
import { proxyActivities } from "@temporalio/workflow";
import type { ReconcileResult } from "../rank-check/reconcile-result";

type ReconcileActivities = {
  reconcileAllSchedulesActivity(): Promise<ReconcileResult>;
};

const { reconcileAllSchedulesActivity } = proxyActivities<ReconcileActivities>({
  retry: {
    backoffCoefficient: 2,
    initialInterval: "5 seconds",
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
  startToCloseTimeout: "2 minutes",
});

export type ReconcileRankCheckSchedulesResult = ReconcileResult;

/**
 * DB and schedule side effects stay in one activity to preserve workflow determinism.
 */
export async function reconcileRankCheckSchedulesWorkflow(): Promise<ReconcileResult> {
  return reconcileAllSchedulesActivity();
}
