import "server-only";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import {
  type QueuedDeadlineMaintenanceCursor,
  reconcileExpiredQueuedRankCheckBatches,
} from "./queued-deadline-maintenance";
import { DEFAULT_STALE_RUNNING_CHECK_MINUTES } from "./stale-window";

export const STALE_RUNNING_CHECK_ERROR = "Check timed out.";
export const STALE_RUNNING_CHECK_BATCH_SIZE = 100;
export { DEFAULT_STALE_RUNNING_CHECK_MINUTES } from "./stale-window";

export type MarkStaleRunningChecksInput = {
  olderThanMinutes?: number;
  now?: Date;
  queuedCursor?: QueuedDeadlineMaintenanceCursor;
};

export type MarkStaleRunningChecksResult = {
  cutoff: Date;
  failed: number;
  olderThanMinutes: number;
  queuedBatches: number;
  queuedFailed: number;
  queuedFailureBatchIds: string[];
  queuedHasMore: boolean;
  queuedNextCursor: QueuedDeadlineMaintenanceCursor | null;
  queuedPending: number;
  queuedSweepAt: Date;
  queuedTerminal: number;
};

function staleWindowMinutes(input?: number) {
  if (input === undefined) {
    return DEFAULT_STALE_RUNNING_CHECK_MINUTES;
  }
  if (!Number.isFinite(input) || input <= 0) {
    throw new Error("olderThanMinutes must be a positive finite number.");
  }
  return input;
}

export async function markStaleRunningChecks(
  input: MarkStaleRunningChecksInput = {},
): Promise<MarkStaleRunningChecksResult> {
  const olderThanMinutes = staleWindowMinutes(input.olderThanMinutes);
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - olderThanMinutes * 60_000);
  const failed = await prisma.$transaction(async (tx) => {
    const staleChecks = await tx.rankCheck.findMany({
      orderBy: { id: "asc" },
      select: {
        estimatedCostCents: true,
        id: true,
        publicId: true,
        keyword: { select: { projectId: true, publicId: true } },
        keywordId: true,
        provider: true,
      },
      take: STALE_RUNNING_CHECK_BATCH_SIZE,
      where: {
        checkedAt: { lt: cutoff },
        queuedTask: null,
        status: "running",
      },
    });
    if (staleChecks.length === 0) {
      return 0;
    }

    const result = await tx.rankCheck.updateMany({
      data: {
        attemptCount: 0,
        degradedToCountry: false,
        error: STALE_RUNNING_CHECK_ERROR,
        estimatedCostCents: null,
        finishedAt: now,
        normalizationVersion: null,
        status: "failed",
        viaFallback: false,
      },
      where: { id: { in: staleChecks.map((check) => check.id) }, status: "running" },
    });

    await Promise.all(
      staleChecks.map((check) =>
        writeAudit(
          {
            action: "rank_check.stale_failed",
            actorId: null,
            after: {
              error: STALE_RUNNING_CHECK_ERROR,
              keywordId: requiredPublicAuditId(check.keyword.publicId, "kw", "Rank-check"),
              provider: check.provider,
              status: "failed",
            },
            before: {
              estimatedCostCents: check.estimatedCostCents,
              provider: check.provider,
              status: "running",
            },
            projectId: check.keyword.projectId,
            targetId: requiredPublicAuditId(check.publicId, "check", "Rank-check"),
            targetType: "rank_check",
          },
          tx,
        ),
      ),
    );

    return result.count;
  });
  const queued = await reconcileExpiredQueuedRankCheckBatches(now, input.queuedCursor);

  return {
    cutoff,
    failed,
    olderThanMinutes,
    queuedBatches: queued.examined,
    queuedFailed: queued.failed,
    queuedFailureBatchIds: queued.failureBatchIds,
    queuedHasMore: queued.hasMore,
    queuedNextCursor: queued.nextCursor,
    queuedPending: queued.pending,
    queuedSweepAt: now,
    queuedTerminal: queued.terminal,
  };
}
