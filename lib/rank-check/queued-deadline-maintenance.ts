import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { deferQueuedRankCheckBatch } from "./queued-lifecycle";
import { QUEUED_DEADLINE_REASON } from "./queued-timeouts";

export const QUEUED_DEADLINE_MAINTENANCE_BATCH_SIZE = 25;

export type QueuedDeadlineMaintenanceCursor = {
  id: string;
  queueDeadlineAt: Date;
};

export type ReconcileExpiredQueuedBatchesResult = {
  examined: number;
  failed: number;
  failureBatchIds: string[];
  hasMore: boolean;
  nextCursor: QueuedDeadlineMaintenanceCursor | null;
  pending: number;
  terminal: number;
};

function selectExpiredQueuedBatches(
  now: Date,
  cursor?: QueuedDeadlineMaintenanceCursor,
): Promise<Array<{ id: string; queueDeadlineAt: Date }>> {
  const afterCursor = cursor
    ? Prisma.sql`
        AND ("queueDeadlineAt", "id") > (${cursor.queueDeadlineAt}, ${cursor.id})
      `
    : Prisma.empty;
  return prisma.$queryRaw(Prisma.sql`
    SELECT "id", "queueDeadlineAt", "state"
    FROM "queued_rank_check_batches"
    WHERE "queueDeadlineAt" <= ${now}
      AND "state" IN ('ambiguous', 'prepared', 'ready', 'submitted', 'submitting')
      ${afterCursor}
    ORDER BY "queueDeadlineAt" ASC, "id" ASC
    LIMIT ${QUEUED_DEADLINE_MAINTENANCE_BATCH_SIZE}
  `);
}

export async function reconcileExpiredQueuedRankCheckBatches(
  now = new Date(),
  cursor?: QueuedDeadlineMaintenanceCursor,
): Promise<ReconcileExpiredQueuedBatchesResult> {
  const batches = await selectExpiredQueuedBatches(now, cursor);
  const failureBatchIds: string[] = [];
  let pending = 0;
  let terminal = 0;
  for (const batch of batches) {
    try {
      const progress = await deferQueuedRankCheckBatch(batch.id, QUEUED_DEADLINE_REASON);
      if (progress.pending > 0) {
        pending += 1;
      } else {
        terminal += 1;
      }
    } catch {
      failureBatchIds.push(batch.id);
      console.error("[rank-check] queued deadline maintenance failed", {
        batchId: batch.id,
      });
    }
  }
  const last = batches.at(-1);
  const hasMore = batches.length === QUEUED_DEADLINE_MAINTENANCE_BATCH_SIZE;
  return {
    examined: batches.length,
    failed: failureBatchIds.length,
    failureBatchIds,
    hasMore,
    nextCursor:
      hasMore && last
        ? {
            id: last.id,
            queueDeadlineAt: last.queueDeadlineAt,
          }
        : null,
    pending,
    terminal,
  };
}
