import "server-only";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { UnrunnableReason } from "@/lib/rank-check/runnable-reasons";
import { ACTIVE_RUN_STATUSES } from "./contract";
import { type FinalizableRankCheckRun, finalizeRankCheckRun } from "./finalize";

const CANCELLED_REASON = "Cancelled by the run.";
const TERMINAL_RETENTION_MS = 30 * 86_400_000;
const CANCELLABLE_RUN_ITEM_WHERE = {
  OR: [{ status: "queued" }, { rankCheckId: null, status: "running" }],
} satisfies Prisma.RankCheckRunItemWhereInput;

type ActiveRunItem = {
  id: string;
  keywordId: string;
  rankCheckId: string | null;
  run: { id: string; projectId: string; publicId: string; requestedCount: number; status: string };
  runId: string;
  status: string;
};

function cancelledItemData(now: Date, reason?: UnrunnableReason) {
  return {
    claimExpiresAt: null,
    finishedAt: now,
    status: "cancelled" as const,
    // A cancelled item bought nothing, so it carries a zero cost rather than an absent one.
    ...(reason ? { actualCostCents: 0, blockedReason: reason } : {}),
  };
}

/**
 * Stops one queued or unlinked-claimed item whose keyword stopped being runnable, naming why.
 * `CANCELLABLE_RUN_ITEM_WHERE` never matches an item with a linked check, so a SERP that was
 * already bought still finishes and is billed.
 */
export async function cancelUnrunnableRunItem(
  tx: Prisma.TransactionClient,
  input: { itemId: string; now: Date; reason: UnrunnableReason; run: FinalizableRankCheckRun },
) {
  const cancelled = await tx.rankCheckRunItem.updateMany({
    data: cancelledItemData(input.now, input.reason),
    where: { id: input.itemId, ...CANCELLABLE_RUN_ITEM_WHERE },
  });
  if (cancelled.count === 0) return false;
  await tx.rankCheckRun.update({
    data: { cancelledCount: { increment: 1 } },
    where: { id: input.run.id },
  });
  await finalizeRankCheckRun(tx, { now: input.now, run: input.run });
  return true;
}

/** Stops a linked run item before its provider call and records why it no longer may run. */
export async function cancelUnrunnableRankCheckRunItem(
  tx: Prisma.TransactionClient,
  input: { rankCheckId: string; reason: UnrunnableReason },
) {
  const item = await tx.rankCheckRunItem.findUnique({
    select: {
      id: true,
      keyword: { select: { publicId: true } },
      run: {
        select: { id: true, projectId: true, publicId: true, requestedCount: true, status: true },
      },
    },
    where: { rankCheckId: input.rankCheckId },
  });
  if (!item?.run) return false;
  const now = new Date();
  const closed = await tx.rankCheck.updateMany({
    data: {
      error: input.reason,
      errorCode: "cancelled",
      estimatedCostCents: null,
      finishedAt: now,
      status: "failed",
    },
    where: { attemptCount: 0, id: input.rankCheckId, status: "running" },
  });
  if (closed.count === 0) return false;
  const cancelled = await tx.rankCheckRunItem.updateMany({
    data: cancelledItemData(now, input.reason),
    where: { rankCheckId: input.rankCheckId, status: "running" },
  });
  if (cancelled.count === 0) return false;
  await tx.rankCheckRun.update({
    data: { cancelledCount: { increment: 1 } },
    where: { id: item.run.id },
  });
  await finalizeRankCheckRun(tx, { now, run: item.run });
  await writeAudit(
    {
      action: "rank_check_run.item_cancelled",
      actorId: null,
      after: {
        itemId: item.id,
        keywordId: requiredPublicAuditId(item.keyword.publicId, "kw", "Rank-check"),
        reason: input.reason,
      },
      projectId: item.run.projectId,
      targetId: requiredPublicAuditId(item.run.publicId, "rcr", "Rank-check run"),
      targetType: "rank_check_run",
    },
    tx,
  );
  return true;
}

function activeDeletionMessage(items: ActiveRunItem[]) {
  const keywordsByRun = new Map<string, Set<string>>();
  for (const item of items) {
    const keywords = keywordsByRun.get(item.run.publicId) ?? new Set<string>();
    keywords.add(item.keywordId);
    keywordsByRun.set(item.run.publicId, keywords);
  }
  const runs = [...keywordsByRun].map(([publicId, keywords]) => ({
    count: keywords.size,
    publicId,
  }));
  if (runs.length === 1) {
    const run = runs[0];
    return `Run ${run.publicId} is still checking ${run.count} keyword${run.count === 1 ? "" : "s"}.`;
  }
  return `Active runs are still checking keywords: ${runs
    .map((run) => `${run.publicId} (${run.count})`)
    .join(", ")}.`;
}

/**
 * Stops cancellable active-run items before their keywords are removed. Linked checks remain
 * protected because deleting their item would hide work that is still in flight.
 */
export async function cancelRunItemsForKeywordDeletion(
  tx: Prisma.TransactionClient,
  keywordIds: string[],
) {
  const items = (await tx.rankCheckRunItem.findMany({
    select: {
      id: true,
      keywordId: true,
      rankCheckId: true,
      run: {
        select: { id: true, projectId: true, publicId: true, requestedCount: true, status: true },
      },
      runId: true,
      status: true,
    },
    where: {
      keywordId: { in: keywordIds },
      run: { status: { in: [...ACTIVE_RUN_STATUSES] } },
    },
  })) as unknown as ActiveRunItem[];
  const inFlight = items.filter((item) => item.status === "running" && item.rankCheckId);
  if (inFlight.length > 0) throw new Error(activeDeletionMessage(inFlight));

  const now = new Date();
  let cancelled = 0;
  for (const item of items) {
    if (item.status !== "queued" && !(item.status === "running" && !item.rankCheckId)) continue;
    const transitioned = await tx.rankCheckRunItem.updateMany({
      data: cancelledItemData(now),
      where: { id: item.id, ...CANCELLABLE_RUN_ITEM_WHERE },
    });
    if (transitioned.count === 0) continue;
    cancelled += 1;
  }
  return { cancelled };
}

export async function cancelRankCheckRun(tx: Prisma.TransactionClient, runId: string) {
  const now = new Date();
  const cancelledPlanned = await tx.rankCheckRun.updateMany({
    data: { finishedAt: now, status: "cancelled" },
    where: { id: runId, status: "planned" },
  });
  if (cancelledPlanned.count > 0) return true;
  const claimed = await tx.rankCheckRun.updateMany({
    data: { status: "cancelling" },
    where: { id: runId, status: { in: ["blocked", "queued", "running"] } },
  });
  if (claimed.count === 0) return false;

  const deferredBatches = await tx.queuedRankCheckBatch.updateMany({
    data: {
      error: CANCELLED_REASON,
      expiresAt: new Date(now.getTime() + TERMINAL_RETENTION_MS),
      state: "deferred",
      terminalAt: now,
    },
    where: { runId, state: "prepared" },
  });
  if (deferredBatches.count > 0) {
    await tx.queuedRankCheckTask.updateMany({
      data: { error: CANCELLED_REASON, state: "deferred" },
      where: { batch: { runId }, state: "prepared" },
    });
  }

  const cancelled = await tx.rankCheckRunItem.updateMany({
    data: cancelledItemData(now),
    where: {
      ...CANCELLABLE_RUN_ITEM_WHERE,
      runId,
    },
  });
  if (cancelled.count > 0) {
    await tx.rankCheckRun.update({
      data: { cancelledCount: { increment: cancelled.count } },
      where: { id: runId },
    });
  }
  const run = await tx.rankCheckRun.findUnique({
    select: { id: true, projectId: true, requestedCount: true, status: true },
    where: { id: runId },
  });
  if (run) await finalizeRankCheckRun(tx, { now, run });
  return true;
}

export async function closeRankCheckAsCancelled(tx: Prisma.TransactionClient, rankCheckId: string) {
  const closed = await tx.rankCheck.updateMany({
    data: {
      errorCode: "cancelled",
      error: CANCELLED_REASON,
      estimatedCostCents: null,
      finishedAt: new Date(),
      status: "failed",
    },
    where: { id: rankCheckId, status: "running" },
  });
  if (closed.count === 0) return false;

  const item = await tx.rankCheckRunItem.findUnique({
    select: {
      run: { select: { id: true, projectId: true, requestedCount: true, status: true } },
      runId: true,
    },
    where: { rankCheckId },
  });
  if (!item) return true;
  const now = new Date();
  const cancelled = await tx.rankCheckRunItem.updateMany({
    data: { finishedAt: now, status: "cancelled" },
    where: { rankCheckId, status: "running" },
  });
  if (cancelled.count === 1) {
    await tx.rankCheckRun.update({
      data: { cancelledCount: { increment: 1 } },
      where: { id: item.runId },
    });
    if (item.run) await finalizeRankCheckRun(tx, { now, run: item.run });
  }
  return true;
}
