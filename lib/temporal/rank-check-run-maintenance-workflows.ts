// Temporal sandbox module: no Prisma, client, Node built-ins, or side effects.
import { continueAsNew, proxyActivities } from "@temporalio/workflow";
import type {
  ReconcileRankCheckRunsActivityInput,
  ReconcileRankCheckRunsActivityResult,
} from "./rank-check-run-activities";

type RankCheckRunActivities = {
  reconcileRankCheckRunsActivity(
    input?: ReconcileRankCheckRunsActivityInput,
  ): Promise<ReconcileRankCheckRunsActivityResult>;
};

const { reconcileRankCheckRunsActivity } = proxyActivities<RankCheckRunActivities>({
  retry: {
    backoffCoefficient: 2,
    initialInterval: "5 seconds",
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
  startToCloseTimeout: "5 minutes",
});

export type ReconcileRankCheckRunsWorkflowState = {
  reconciled: number;
  sweepAt: string;
};

export async function reconcileRankCheckRunsWorkflow(
  state?: ReconcileRankCheckRunsWorkflowState,
): Promise<ReconcileRankCheckRunsWorkflowState> {
  const chunk = await reconcileRankCheckRunsActivity(
    state ? { sweepAt: state.sweepAt } : undefined,
  );
  const total = {
    reconciled: (state?.reconciled ?? 0) + chunk.reconciled,
    sweepAt: chunk.sweepAt,
  };
  if (chunk.hasMore) {
    return continueAsNew<typeof reconcileRankCheckRunsWorkflow>(total);
  }
  return total;
}
