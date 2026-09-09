import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { DEFAULT_STALE_RUNNING_CHECK_MINUTES } from "@/lib/rank-check/stale-window";

export type RankDispatchHeartbeat = {
  expiredClaims: number;
  oldestExpiredClaimAt: string | null;
  oldestOverdueQueuedAt: string | null;
  overdueQueued: number;
};

type RankDispatchHeartbeatDatabase = Pick<PrismaClient, "$queryRaw">;
type RankDispatchHeartbeatRow = {
  expiredClaims: bigint | number;
  oldestExpiredClaimAt: Date | null;
  oldestOverdueQueuedAt: Date | null;
  overdueQueued: bigint | number;
};

/**
 * Warning evidence only: expired unlinked claims and queued work past the 15-minute stale window
 * do not prove a dispatcher SQL failure.
 * Only dispatchable parents are inspected. Future/null notBefore rows have no overdue signal;
 * existing claims remain visible even if a keyword now needs cancellation instead of dispatch.
 */
export async function collectRankDispatchHeartbeat(
  now: Date,
  database: RankDispatchHeartbeatDatabase = prisma,
): Promise<RankDispatchHeartbeat> {
  const overdueQueuedBefore = new Date(
    now.getTime() - DEFAULT_STALE_RUNNING_CHECK_MINUTES * 60_000,
  );
  const [row] = await database.$queryRaw<RankDispatchHeartbeatRow[]>(Prisma.sql`
    SELECT
      COUNT(*) FILTER (
        WHERE item.status = 'running'
          AND item."rankCheckId" IS NULL
          AND item."claimExpiresAt" < ${now}::timestamp(3)
      ) AS "expiredClaims",
      MIN(item."claimExpiresAt") FILTER (
        WHERE item.status = 'running'
          AND item."rankCheckId" IS NULL
          AND item."claimExpiresAt" < ${now}::timestamp(3)
      ) AS "oldestExpiredClaimAt",
      COUNT(*) FILTER (
        WHERE item.status = 'queued'
          AND item."notBefore" IS NOT NULL
          AND item."notBefore" < ${overdueQueuedBefore}::timestamp(3)
      ) AS "overdueQueued",
      MIN(item."notBefore") FILTER (
        WHERE item.status = 'queued'
          AND item."notBefore" IS NOT NULL
          AND item."notBefore" < ${overdueQueuedBefore}::timestamp(3)
      ) AS "oldestOverdueQueuedAt"
    FROM "rank_check_run_items" item
    JOIN "rank_check_runs" run ON run.id = item."runId"
    WHERE run.status IN ('queued', 'running')
      AND item.status IN ('queued', 'running')
  `);
  if (!row) throw new Error("Rank dispatch heartbeat aggregate is unavailable.");
  return {
    expiredClaims: Number(row.expiredClaims),
    oldestExpiredClaimAt: row.oldestExpiredClaimAt?.toISOString() ?? null,
    oldestOverdueQueuedAt: row.oldestOverdueQueuedAt?.toISOString() ?? null,
    overdueQueued: Number(row.overdueQueued),
  };
}
