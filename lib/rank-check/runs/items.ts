import "server-only";

import { Prisma } from "@/lib/generated/prisma/client";
import { markRankCheckRunStarted } from "@/lib/rank-check/items-claim";
import { finalizeRankCheckRun } from "./finalize";

type TerminalItemStatus = "completed" | "deferred" | "failed";

export class RunItemKeywordMismatchError extends Error {
  constructor() {
    super("Rank-check run item belongs to a different keyword.");
    this.name = "RunItemKeywordMismatchError";
  }
}

export function assertRunItemKeyword(actualKeywordId: string, expectedKeywordId: string) {
  if (actualKeywordId !== expectedKeywordId) throw new RunItemKeywordMismatchError();
}

const counterForStatus = {
  completed: "completedCount",
  deferred: "deferredCount",
  failed: "failedCount",
} as const satisfies Record<TerminalItemStatus, string>;

async function lockRunForItemTransition(tx: Prisma.TransactionClient, rankCheckId: string) {
  await tx.$queryRaw(Prisma.sql`
    SELECT run.id
    FROM "rank_check_run_items" item
    JOIN "rank_check_runs" run ON run.id = item."runId"
    WHERE item."rankCheckId" = ${rankCheckId}
    FOR UPDATE OF run
  `);
}

export async function applyRunItemTransition(
  tx: Prisma.TransactionClient,
  input: { rankCheckId: string; to: TerminalItemStatus },
) {
  const runItems = (tx as Partial<Prisma.TransactionClient>).rankCheckRunItem;
  if (!runItems) return false;
  await lockRunForItemTransition(tx, input.rankCheckId);
  const item = await runItems.findUnique({
    select: {
      run: { select: { id: true, projectId: true, requestedCount: true, status: true } },
      runId: true,
    },
    where: { rankCheckId: input.rankCheckId },
  });
  if (!item) return false;
  const rankCheck =
    input.to === "deferred"
      ? null
      : await tx.rankCheck.findUniqueOrThrow({
          select: { costCents: true },
          where: { id: input.rankCheckId },
        });
  const actualCostCents =
    rankCheck === null || rankCheck.costCents === null ? null : Number(rankCheck.costCents);

  const now = new Date();
  const transitioned = await runItems.updateMany({
    data: {
      ...(input.to === "deferred" ? {} : { actualCostCents }),
      finishedAt: now,
      status: input.to,
    },
    where: {
      rankCheckId: input.rankCheckId,
      status: { in: ["queued", "running"] },
    },
  });
  if (transitioned.count === 0) return false;

  await tx.rankCheckRun.update({
    data: { [counterForStatus[input.to]]: { increment: 1 } },
    where: { id: item.runId },
  });
  if (item.run) {
    await finalizeRankCheckRun(tx, { now, run: item.run });
  }
  if (!item.run?.projectId) return false;
  return { projectId: item.run.projectId };
}

export async function linkRunItemToRankCheck(
  tx: Prisma.TransactionClient,
  input: { keywordId: string; rankCheckId: string; runItemId: string; startedAt: Date },
) {
  const item = await tx.rankCheckRunItem.findUnique({
    select: {
      keywordId: true,
      rankCheckId: true,
      run: { select: { projectId: true } },
      runId: true,
    },
    where: { id: input.runItemId },
  });
  if (!item) throw new Error("Rank-check run item not found.");
  assertRunItemKeyword(item.keywordId, input.keywordId);

  const linked = await tx.rankCheckRunItem.updateMany({
    data: {
      rankCheckId: input.rankCheckId,
      startedAt: input.startedAt,
      status: "running",
    },
    where: { id: input.runItemId, status: "queued" },
  });
  if (linked.count === 0) {
    const current = await tx.rankCheckRunItem.findUnique({
      select: { rankCheckId: true },
      where: { id: input.runItemId },
    });
    return {
      linked: false,
      projectId: item.run.projectId,
      rankCheckId: current?.rankCheckId ?? item.rankCheckId,
      runId: item.runId,
    };
  }

  await markRankCheckRunStarted(tx, { now: input.startedAt, runId: item.runId });
  return {
    linked: true,
    projectId: item.run.projectId,
    rankCheckId: input.rankCheckId,
    runId: item.runId,
  };
}

/**
 * Closes a queued item as deferred when another run's item is already checking its keyword. The
 * running index admits one check per keyword, and a failed link would otherwise leave the item
 * queued with no workflow left to start it, so the run could never finish.
 */
export async function deferRunItemForBusyKeyword(
  tx: Prisma.TransactionClient,
  input: { keywordId: string; now: Date; runItemId: string },
) {
  const busy = await tx.rankCheckRunItem.findFirst({
    select: { id: true },
    where: { id: { not: input.runItemId }, keywordId: input.keywordId, status: "running" },
  });
  if (!busy) return false;
  const item = await tx.rankCheckRunItem.findUnique({
    select: { run: { select: { id: true, projectId: true, requestedCount: true, status: true } } },
    where: { id: input.runItemId },
  });
  if (!item) return false;
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM "rank_check_runs" WHERE id = ${item.run.id} FOR UPDATE
  `);
  const deferred = await tx.rankCheckRunItem.updateMany({
    data: { claimExpiresAt: null, finishedAt: input.now, status: "deferred" },
    where: { id: input.runItemId, rankCheckId: null, status: "queued" },
  });
  if (deferred.count === 0) return false;
  await tx.rankCheckRun.update({
    data: { deferredCount: { increment: 1 } },
    where: { id: item.run.id },
  });
  await finalizeRankCheckRun(tx, { now: input.now, run: item.run });
  return true;
}
