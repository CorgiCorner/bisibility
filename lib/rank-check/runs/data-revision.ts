import "server-only";

import { prisma } from "@/lib/db/prisma";

const RECENT_STARTED_RUN_LIMIT = 25;

// Hash in PostgreSQL to return one token after two index-served reads.
// Terminal changes older than the newest K started runs are outside this token;
// LU-3's unconditional focus/visibility/reconnect page refresh reconciles them.
export async function readRankDataRevision(projectId: string): Promise<string> {
  const [row] = await prisma.$queryRaw<Array<{ revision: string }>>`
    WITH bounded_runs AS (
      SELECT id, status, outcome, "completedCount", "failedCount", "deferredCount",
        "cancelledCount", "skippedCount", "updatedAt", "deletedAt"
      FROM "rank_check_runs"
      WHERE "projectId" = ${projectId}
        AND status IN ('queued', 'running', 'cancelling', 'blocked')
      UNION
      (SELECT id, status, outcome, "completedCount", "failedCount", "deferredCount",
        "cancelledCount", "skippedCount", "updatedAt", "deletedAt"
      FROM "rank_check_runs"
      WHERE "projectId" = ${projectId} AND "startedAt" IS NOT NULL
      ORDER BY "startedAt" DESC, id DESC
      LIMIT ${RECENT_STARTED_RUN_LIMIT})
    )
    SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(
      jsonb_build_array(id, status, outcome, "completedCount", "failedCount", "deferredCount",
        "cancelledCount", "skippedCount", "updatedAt", "deletedAt") ORDER BY id
    ), '[]'::jsonb)::text, 'UTF8')), 'hex') AS revision
    FROM bounded_runs
  `;
  return row.revision;
}
