import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { FirstSyncIntentClient, FirstTrafficSyncIntentClaim } from "./first-sync-intent-claim";
import { syncTrafficForProject } from "./sync";

export { FIRST_TRAFFIC_SYNC_STALE_CLAIM_MINUTES } from "./first-sync-intent-state";

type SyncProject = (
  projectId: string,
  now: Date,
  scheduledFor?: Date | null,
  options?: { connectionId?: string },
) => Promise<unknown>;

type RunClaimedFirstTrafficSyncIntentOptions = {
  client?: FirstSyncIntentClient;
  syncProject?: SyncProject;
};

export type RunClaimedFirstTrafficSyncIntentResult = {
  connectionId: string;
  projectId: string;
  reclaimed: boolean;
  status: "finished";
};

export async function runClaimedFirstTrafficSyncIntent(
  claimed: FirstTrafficSyncIntentClaim,
  options: RunClaimedFirstTrafficSyncIntentOptions = {},
): Promise<RunClaimedFirstTrafficSyncIntentResult> {
  const client = options.client ?? prisma;
  const now = claimed.firstSyncStartedAt;
  console.info("[traffic] worker started first sync", {
    connectionId: claimed.id,
    projectId: claimed.projectId,
    reclaimed: claimed.reclaimed,
    requestedAt: claimed.firstSyncRequestedAt.toISOString(),
  });
  await (options.syncProject ?? syncTrafficForProject)(claimed.projectId, now, null, {
    connectionId: claimed.id,
  });
  await client.providerConnection.updateMany({
    data: { firstSyncFinishedAt: new Date() },
    where: {
      firstSyncFinishedAt: null,
      firstSyncRequestedAt: claimed.firstSyncRequestedAt,
      firstSyncStartedAt: claimed.firstSyncStartedAt,
      id: claimed.id,
    },
  });
  return {
    connectionId: claimed.id,
    projectId: claimed.projectId,
    reclaimed: claimed.reclaimed,
    status: "finished",
  };
}
