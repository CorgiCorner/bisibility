import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  hasProviderFailureShare,
  hasTrafficFailureStreak,
  isTransientTrafficFailure,
  TRAFFIC_FAILURE_STREAK_THRESHOLD,
} from "./failure-policy";

const DIGEST_WINDOW_MS = 24 * 60 * 60 * 1000;

function failedConnectionCountFromLatestRuns(
  runs: Array<{ connectionId: string | null; errorClass: string | null; status: string }>,
) {
  const seenConnectionIds = new Set<string>();
  let failedConnections = 0;

  for (const run of runs) {
    if (!run.connectionId || seenConnectionIds.has(run.connectionId)) continue;
    seenConnectionIds.add(run.connectionId);
    if (run.status === "failed" && isTransientTrafficFailure(run.errorClass)) {
      failedConnections += 1;
    }
  }

  return failedConnections;
}

export async function shouldEscalateTrafficFailure(input: {
  connectionId: string;
  now: Date;
  provider: string;
}) {
  const since = new Date(input.now.getTime() - DIGEST_WINDOW_MS);
  const [recentRuns, eligibleConnections] = await Promise.all([
    prisma.operationalRun.findMany({
      orderBy: { startedAt: "desc" },
      select: { errorClass: true, status: true },
      take: TRAFFIC_FAILURE_STREAK_THRESHOLD,
      where: { connectionId: input.connectionId, kind: "traffic_sync" },
    }),
    prisma.providerConnection.findMany({
      select: { id: true },
      where: {
        enabled: true,
        kind: "analytics",
        provider: input.provider,
        status: { in: ["connected", "needs_reauth"] },
      },
    }),
  ]);
  const eligibleConnectionIds = eligibleConnections.map((connection) => connection.id);
  const providerRuns =
    eligibleConnectionIds.length === 0
      ? []
      : await prisma.operationalRun.findMany({
          orderBy: { startedAt: "desc" },
          select: { connectionId: true, errorClass: true, status: true },
          where: {
            connectionId: { in: eligibleConnectionIds },
            kind: "traffic_sync",
            provider: input.provider,
            startedAt: { gte: since },
          },
        });

  return (
    hasTrafficFailureStreak(recentRuns) ||
    hasProviderFailureShare(
      failedConnectionCountFromLatestRuns(providerRuns),
      eligibleConnectionIds.length,
    )
  );
}
