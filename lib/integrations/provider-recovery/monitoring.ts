import "server-only";
import { prisma } from "@/lib/db/prisma";
import { accountHealthProviders } from "@/lib/providers/account-health/registry";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog-metadata";
import { readConnectionRecovery } from "./read";

export async function readMonitoringAccountBlocks(projectId: string, now = new Date()) {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [connections, counts] = await Promise.all([
    prisma.providerConnection.findMany({
      where: {
        projectId,
        provider: { in: accountHealthProviders() },
        credentialSource: "own",
        status: "connected",
        enabled: true,
      },
      select: { id: true, provider: true, publicId: true },
    }),
    prisma.$queryRaw<{ connectionId: string; count: bigint }[]>`
      SELECT b."connectionId",count(DISTINCT rc.id) AS count
      FROM provider_blocked_attempts b JOIN provider_connections c ON c.id=b."connectionId"
      JOIN rank_checks rc ON rc.id=b."rankCheckId" JOIN keywords k ON k.id=rc."keywordId"
      WHERE c."projectId"=${projectId} AND k."projectId"=${projectId} AND b.reason='account_blocked'
        AND b."createdAt">=${since} AND b."createdAt"<=${now}
        AND rc.status='deferred' AND rc."deferredReason"='provider_account_blocked'
      GROUP BY b."connectionId"`,
  ]);
  const views = await Promise.all(
    connections.map(async (connection) => ({
      ...connection,
      view: await readConnectionRecovery(projectId, connection.id, now),
    })),
  );
  return views
    .filter(({ view }) => view?.paused)
    .map(({ id, provider, publicId, view }) => ({
      connectionId: publicId,
      provider: PROVIDER_CATALOG.find((entry) => entry.id === provider)?.label ?? provider,
      reason: view?.reason ?? ("not_verified" as const),
      deferred: Number(counts.find((row) => row.connectionId === id)?.count ?? 0),
    }));
}
