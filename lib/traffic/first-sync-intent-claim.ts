import "server-only";

import { prisma } from "@/lib/db/prisma";
import { firstTrafficSyncClaimStaleBefore } from "./first-sync-intent-state";

export type FirstSyncIntentClient = Pick<
  typeof prisma,
  "$transaction" | "operationalRun" | "providerConnection"
>;

type ClaimFirstTrafficSyncIntentOptions = {
  client?: FirstSyncIntentClient;
  connectionId?: string;
  now?: Date;
};

export type FirstTrafficSyncIntentClaim = {
  firstSyncRequestedAt: Date;
  firstSyncStartedAt: Date;
  id: string;
  projectId: string;
  reclaimed: boolean;
};

export async function claimFirstTrafficSyncIntent(
  options: ClaimFirstTrafficSyncIntentOptions = {},
): Promise<FirstTrafficSyncIntentClaim | null> {
  const client = options.client ?? prisma;
  const now = options.now ?? new Date();
  const staleBefore = firstTrafficSyncClaimStaleBefore(now);
  const utcDayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  return client.$transaction(async (tx) => {
    const candidate = await tx.providerConnection.findFirst({
      ...(options.connectionId ? {} : { orderBy: { firstSyncRequestedAt: "asc" } }),
      select: {
        firstSyncRequestedAt: true,
        firstSyncStartedAt: true,
        id: true,
        projectId: true,
      },
      where: {
        ...(options.connectionId ? { id: options.connectionId } : {}),
        enabled: true,
        firstSyncFinishedAt: null,
        firstSyncRequestedAt: { not: null },
        kind: "analytics",
        OR: [{ firstSyncStartedAt: null }, { firstSyncStartedAt: { lt: staleBefore } }],
        status: "connected",
      },
    });
    const requestedAt = candidate?.firstSyncRequestedAt;
    if (!candidate || !requestedAt) return null;

    const syncedToday = await tx.operationalRun.findFirst({
      select: { id: true },
      where: {
        connectionId: candidate.id,
        kind: "traffic_sync",
        startedAt: { gte: utcDayStart },
      },
    });
    if (syncedToday) {
      await tx.providerConnection.updateMany({
        data: { firstSyncFinishedAt: now },
        where: {
          firstSyncFinishedAt: null,
          firstSyncRequestedAt: requestedAt,
          firstSyncStartedAt: candidate.firstSyncStartedAt,
          id: candidate.id,
        },
      });
      return null;
    }

    const result = await tx.providerConnection.updateMany({
      data: { firstSyncStartedAt: now },
      where: {
        firstSyncFinishedAt: null,
        firstSyncRequestedAt: requestedAt,
        firstSyncStartedAt: candidate.firstSyncStartedAt,
        id: candidate.id,
      },
    });
    if (result.count !== 1) return null;
    return {
      firstSyncRequestedAt: requestedAt,
      firstSyncStartedAt: now,
      id: candidate.id,
      projectId: candidate.projectId,
      reclaimed: candidate.firstSyncStartedAt !== null,
    };
  });
}
