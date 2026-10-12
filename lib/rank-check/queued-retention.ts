import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";

export const QUEUED_RANK_CHECK_RETENTION_PAGE_SIZE = 100;

export async function purgeExpiredQueuedRankCheckBatches(now = new Date()) {
  const candidates = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT b.id FROM queued_rank_check_batches b
    WHERE b."expiresAt"<${now} AND b.state IN ('completed','deferred','failed')
      AND NOT EXISTS (
        SELECT 1 FROM queued_rank_check_tasks t WHERE t."batchId"=b.id AND (
          EXISTS(SELECT 1 FROM metering_usage_evidence e
            WHERE e."correlationId"=t.id AND NOT e.discarded AND e."measurementStatus"='unknown')
          OR ((t."providerTaskId" IS NOT NULL OR t."meteringContext" IS NOT NULL) AND NOT EXISTS (
            SELECT 1 FROM metering_operation o JOIN LATERAL (
              SELECT body FROM metering_receipt WHERE operation_pk=o.operation_pk ORDER BY sequence DESC LIMIT 1
            ) r ON TRUE
            WHERE o.state IN ('settled','released')
              AND o.input->'scope'->>'group'=b."projectId"
              AND (o.input->>'correlationId'=t.id OR EXISTS (
                SELECT 1 FROM metering_paid_attempt_context c WHERE c.namespace=o.namespace
                  AND c.operation_id=o.operation_id AND c.context->>'correlationId'=t.id))
              AND r.body->'cost'->>'certainty'='measured'
              AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.body->'measurements') m
                WHERE m->>'certainty' IS DISTINCT FROM 'measured' OR m->'quantity'='null'::jsonb)
          ))
        )
      )
    ORDER BY b.id LIMIT ${QUEUED_RANK_CHECK_RETENTION_PAGE_SIZE + 1}`);
  const page = candidates.slice(0, QUEUED_RANK_CHECK_RETENTION_PAGE_SIZE);
  const deleted = page.length
    ? (
        await prisma.queuedRankCheckBatch.deleteMany({
          where: { id: { in: page.map((b) => b.id) } },
        })
      ).count
    : 0;
  return {
    deleted,
    hasMore: candidates.length > QUEUED_RANK_CHECK_RETENTION_PAGE_SIZE,
    pageSize: QUEUED_RANK_CHECK_RETENTION_PAGE_SIZE,
  };
}
