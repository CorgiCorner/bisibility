import type { Prisma } from "@/lib/generated/prisma/client";
import { assertRunRecoveryAdmission } from "@/lib/rank-check/recovery-run-grant";

/** Retain business IDs before deletion; this index contains no amounts or request content. */
export async function rankAttribution(
  tx: Prisma.TransactionClient,
  projectId: string,
  correlationId: string,
) {
  const [row] = await tx.$queryRaw<
    {
      rankCheckId: string;
      rankCheckRunId: string | null;
      rankCheckRunItemId: string | null;
      keywordId: string;
    }[]
  >`
    SELECT r.id AS "rankCheckId",r."runId" AS "rankCheckRunId",i.id AS "rankCheckRunItemId",r."keywordId"
    FROM rank_checks r JOIN keywords k ON k.id=r."keywordId" LEFT JOIN rank_check_run_items i ON i."rankCheckId"=r.id AND i."runId"=r."runId" AND i."keywordId"=r."keywordId"
    WHERE k."projectId"=${projectId} AND (r.id=${correlationId} OR r.id IN (
      SELECT "rankCheckId" FROM queued_rank_check_tasks WHERE id=${correlationId})) LIMIT 1`;
  const recovery = row?.rankCheckRunId
    ? await assertRunRecoveryAdmission(tx, row.rankCheckRunId, row.rankCheckId)
    : {};
  return row
    ? {
        rankCheckId: row.rankCheckId,
        ...(recovery.recoveryGrantExpiresAt
          ? {
              recoveryGrantExpiresAt: recovery.recoveryGrantExpiresAt,
              recoveryMaxCostCents: recovery.recoveryMaxCostCents,
            }
          : {}),
        keywordId: row.keywordId,
        ...(row.rankCheckRunId ? { rankCheckRunId: row.rankCheckRunId } : {}),
        ...(row.rankCheckRunItemId ? { rankCheckRunItemId: row.rankCheckRunItemId } : {}),
      }
    : {};
}
