import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { ProviderStatus } from "@/lib/providers/types";
import { providerChainOrderBy, providerChainWhere } from "@/lib/rank-check/provider-chain-order";

export type TrafficConnection = {
  credentialsEncrypted: string | null;
  firstSyncFinishedAt: Date | null;
  firstSyncRequestedAt: Date | null;
  firstSyncStartedAt: Date | null;
  id: string;
  provider: string;
  status: ProviderStatus;
};

export type TrafficConnectionLoadOptions = {
  connectionId?: string;
  dailyFirstSyncCutoff?: Date;
};

export async function loadTrafficConnections(
  projectId: string,
  { connectionId, dailyFirstSyncCutoff }: TrafficConnectionLoadOptions = {},
): Promise<TrafficConnection[]> {
  return prisma.providerConnection.findMany({
    orderBy: providerChainOrderBy(),
    select: {
      credentialsEncrypted: true,
      firstSyncFinishedAt: true,
      firstSyncRequestedAt: true,
      firstSyncStartedAt: true,
      id: true,
      provider: true,
      status: true,
    },
    where: {
      ...providerChainWhere("analytics"),
      ...(connectionId ? { id: connectionId } : {}),
      // First-sync intents are exclusively dispatched by the intent worker. A daily run resumes
      // the connection tomorrow, after the first-sync workflow has completed.
      ...(dailyFirstSyncCutoff
        ? {
            OR: [
              { firstSyncRequestedAt: null },
              { firstSyncFinishedAt: { lt: dailyFirstSyncCutoff } },
            ],
          }
        : {}),
      projectId,
      status: { in: ["connected", "needs_reauth"] },
    },
  });
}
