import "server-only";

import { runClaimedFirstTrafficSyncIntent } from "../traffic/first-sync-intent";
import type { FirstTrafficSyncIntentClaim } from "../traffic/first-sync-intent-claim";
import type { FirstTrafficSyncWorkflowInput } from "./traffic-first-sync-contract";

function claimFromInput(input: FirstTrafficSyncWorkflowInput): FirstTrafficSyncIntentClaim {
  return {
    firstSyncRequestedAt: new Date(input.firstSyncRequestedAt),
    firstSyncStartedAt: new Date(input.firstSyncStartedAt),
    id: input.connectionId,
    projectId: input.projectId,
    reclaimed: input.reclaimed,
  };
}

export async function syncFirstTrafficIntentActivity(input: FirstTrafficSyncWorkflowInput) {
  return runClaimedFirstTrafficSyncIntent(claimFromInput(input));
}
