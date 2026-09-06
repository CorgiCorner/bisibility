import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";

export const WORKER_INTENT_PENDING_PROBE = Prisma.sql`
  SELECT
    EXISTS (
      SELECT 1
      FROM "search_analytics_imports"
      WHERE "syncRequestedAt" IS NOT NULL
        AND "syncStartedAt" IS NULL
        AND "pausedReason" IS NULL
        AND "source" = 'gsc'
        AND "state" NOT IN ('queued', 'running')
    )
    OR EXISTS (
      SELECT 1
      FROM "provider_connections"
      WHERE "kind" = 'analytics'
        AND "enabled" = true
        AND "status" = 'connected'
        AND "firstSyncRequestedAt" IS NOT NULL
        AND "firstSyncFinishedAt" IS NULL
        AND (
          "firstSyncStartedAt" IS NULL
          OR "firstSyncStartedAt" < NOW() - INTERVAL '35 minutes'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM "users"
      WHERE "welcomeFollowupRequestedAt" IS NOT NULL
        AND "welcomeFollowupFinishedAt" IS NULL
        AND "welcomeFollowupExpiredAt" IS NULL
        AND (
          "welcomeFollowupStartedAt" IS NULL
          OR "welcomeFollowupStartedAt" < NOW() - INTERVAL '35 minutes'
        )
    )
    OR EXISTS (
      -- Served by the (status, claimedAt, id) index on rank_check_runs.
      SELECT 1
      FROM "rank_check_runs"
      WHERE "status" = 'queued'
        AND "claimedAt" IS NULL
        AND "orchestrationWorkflowId" IS NOT NULL
    ) AS "pending"
`;

export async function hasPendingWorkerIntent() {
  const [result] = await prisma.$queryRaw<Array<{ pending: boolean }>>(WORKER_INTENT_PENDING_PROBE);
  return result?.pending ?? false;
}
