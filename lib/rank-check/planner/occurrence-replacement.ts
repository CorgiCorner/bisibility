import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { activeMarketLocationIds, isRunnableKeyword } from "@/lib/rank-check/runnable";
import {
  lockRunSelectionKeywords,
  runSelectionKeywordInProgress,
} from "@/lib/rank-check/runs/selection";
import { scheduledRunMembers } from "./schedule-members";

type DeferredContext = {
  now: Date;
  occurrence: { plannedFor: Date; intervalMs: number };
  selectionHash: string;
};

/** Retry only unattempted cancelled or fully deferred work. Caller holds the project lock. */
export async function cancelledOccurrenceReplacement(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string;
    scheduleId: string;
    occurrenceKey: string;
    baseKey: string;
    deferred?: DeferredContext;
  },
) {
  const latest = await tx.rankCheckRun.findFirst({
    where: {
      projectId: input.projectId,
      checkScheduleId: input.scheduleId,
      trigger: "scheduled",
      selectionKind: "scheduled_due",
      selectionSpec: { path: ["occurrenceKey"], equals: input.occurrenceKey },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      publicId: true,
      launchedAt: true,
      outcome: true,
      blockedReason: true,
      plannedFor: true,
      estimatedCostCents: true,
      requestedCount: true,
      skippedCount: true,
      targetCount: true,
      totalCount: true,
      keywordCount: true,
      completedCount: true,
      failedCount: true,
      cancelledCount: true,
      selectionHash: true,
      status: true,
      startedAt: true,
      costCents: true,
      _count: { select: { items: true, rankChecks: true, queuedRankCheckBatches: true } },
      items: {
        where: {
          OR: [
            { status: { not: "cancelled" } },
            { blockedReason: { not: "schedule_changed" } },
            { blockedReason: null },
            { rankCheckId: { not: null } },
            { actualCostCents: { not: 0 } },
            { actualCostCents: null },
          ],
        },
        take: 1,
        select: { id: true },
      },
    },
  });
  if (
    !latest ||
    !["completed", "cancelled"].includes(latest.status) ||
    latest.startedAt !== null ||
    latest.costCents !== 0 ||
    latest.items.length !== 0 ||
    latest._count.rankChecks !== 0 ||
    latest._count.queuedRankCheckBatches !== 0
  )
    return null;
  if (latest._count.items > 0)
    return {
      idempotencyKey: `${input.baseKey}:after:${latest.publicId}`,
      replacesCancelledRunPublicId: latest.publicId,
    };
  const context = input.deferred;
  if (
    !context ||
    latest.status !== "completed" ||
    latest.outcome !== "deferred" ||
    latest.blockedReason !== "targets_in_progress" ||
    latest.launchedAt !== null ||
    latest.estimatedCostCents !== 0 ||
    latest.requestedCount <= 0 ||
    latest.skippedCount !== latest.requestedCount ||
    latest.targetCount !== 0 ||
    latest.totalCount !== 0 ||
    latest.keywordCount !== 0 ||
    latest.completedCount !== 0 ||
    latest.failedCount !== 0 ||
    latest.cancelledCount !== 0 ||
    latest.selectionHash !== context.selectionHash ||
    latest.plannedFor?.getTime() !== context.occurrence.plannedFor.getTime() ||
    context.now.getTime() < context.occurrence.plannedFor.getTime() ||
    context.now.getTime() >= context.occurrence.plannedFor.getTime() + context.occurrence.intervalMs
  )
    return null;
  const members = await tx.keyword.findMany({
    where: { projectId: input.projectId, checkScheduleId: input.scheduleId, archivedAt: null },
    select: { id: true },
  });
  if (
    members.length !== latest.requestedCount ||
    scheduledRunMembers(members).selectionHash !== latest.selectionHash
  )
    return null;
  const rows = await lockRunSelectionKeywords(
    tx,
    input.projectId,
    members.map(({ id }) => id),
  );
  const locations = await activeMarketLocationIds(input.projectId, tx);
  if (
    rows.length !== members.length ||
    rows.some((row) => !isRunnableKeyword(row, locations) || runSelectionKeywordInProgress(row))
  )
    return null;
  return {
    idempotencyKey: `${input.baseKey}:after:${latest.publicId}`,
    replacesDeferredRunPublicId: latest.publicId,
  };
}
