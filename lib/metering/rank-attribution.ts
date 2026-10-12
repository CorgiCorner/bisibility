import type { Prisma } from "@/lib/generated/prisma/client";

/** Retain business IDs before deletion; this index contains no amounts or request content. */
export async function rankAttribution(
  tx: Prisma.TransactionClient,
  projectId: string,
  correlationId: string,
) {
  const [row] = await tx.$queryRaw<
    { rankCheckId: string; rankCheckRunId: string | null; keywordId: string }[]
  >`
    SELECT r.id AS "rankCheckId",r."runId" AS "rankCheckRunId",r."keywordId"
    FROM rank_checks r JOIN keywords k ON k.id=r."keywordId"
    WHERE k."projectId"=${projectId} AND (r.id=${correlationId} OR r.id IN (
      SELECT "rankCheckId" FROM queued_rank_check_tasks WHERE id=${correlationId})) LIMIT 1`;
  return row
    ? {
        rankCheckId: row.rankCheckId,
        keywordId: row.keywordId,
        ...(row.rankCheckRunId ? { rankCheckRunId: row.rankCheckRunId } : {}),
      }
    : {};
}
