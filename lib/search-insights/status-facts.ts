import { getWorkerLivenessDetails } from "@/lib/ops/liveness";
import {
  compareWorkerTemporalIdentity,
  type WorkerTemporalStatus,
} from "@/lib/ops/worker-temporal-identity";
import type {
  SearchInsightsContext,
  SearchInsightsScope,
} from "@/lib/search-insights/queries/context";
import type { SearchSyncControlFacts } from "@/lib/search-insights/sync/control-model";
import { temporalDeploymentConfig } from "@/lib/temporal/deployment-config";

export type SearchInsightsStatus = {
  facts: SearchSyncControlFacts;
  workerStatus: WorkerTemporalStatus;
};

/** Assemble the one runtime view shared by the trust strip and the no-data state. */
export async function loadSearchInsightsStatus(
  context: SearchInsightsContext,
  scope: SearchInsightsScope,
): Promise<SearchInsightsStatus> {
  // No Temporal call here, deliberately. The web process cannot reach the cluster in production
  // (its firewall admits operator addresses only), so a describe was a guaranteed ten second wait
  // followed by a guaranteed "unknown". Worker liveness travels through Redis, which the app can
  // reach, and the stall detector now derives from request-usage silence instead.
  const workerLiveness = await getWorkerLivenessDetails();
  const workerStatus = {
    status: workerLiveness.status,
    temporalIdentityComparison: compareWorkerTemporalIdentity(
      temporalDeploymentConfig(),
      workerLiveness,
    ),
  };
  return {
    facts: {
      connectionStatus: context.connection.status,
      observability: context.importState?.facts ?? undefined,
      pauseStartedAt: context.importState?.pauseStartedAt,
      pausedReason: context.importState?.pausedReason,
      queue: scope.queue ?? undefined,
      runtime: { workerStatus },
      safeError: context.importState?.safeError,
      state: context.importState?.state,
    },
    workerStatus,
  };
}
