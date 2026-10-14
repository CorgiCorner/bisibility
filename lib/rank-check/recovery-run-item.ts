import type { Prisma } from "@/lib/generated/prisma/client";
import { pendingRunItemCount, runCounterData, runCountsFromItemGroups } from "./runs/counts";
import { finalRunData } from "./runs/finalize";

export async function recoverRunItem(tx: Prisma.TransactionClient, checkId: string, now: Date) {
  await tx.$queryRaw`SELECT run.id FROM rank_check_runs run JOIN rank_check_run_items item
    ON item."runId"=run.id WHERE item."rankCheckId"=${checkId} FOR UPDATE OF run`;
  const item = await tx.rankCheckRunItem.findUnique({
    where: { rankCheckId: checkId },
    include: { run: true },
  });
  if (
    !item ||
    item.run.deletedAt ||
    ["cancelled", "cancelling"].includes(item.run.status) ||
    item.status === "cancelled"
  )
    return;
  // The integer legacy cache cannot represent fractional native costs. Public reads use the ledger.
  await tx.rankCheckRunItem.update({
    where: { id: item.id },
    data: {
      status: "completed",
      finishedAt: now,
      actualCostCents: null,
      claimExpiresAt: null,
    },
  });
  const groups = await tx.rankCheckRunItem.groupBy({
    by: ["keywordId", "status"],
    where: { runId: item.runId },
    _count: { _all: true },
    _sum: { actualCostCents: true },
  });
  const counters = runCounterData(runCountsFromItemGroups(groups, item.run.requestedCount), groups);
  const terminal = pendingRunItemCount(groups) === 0;
  await tx.rankCheckRun.update({
    where: { id: item.runId },
    data: terminal
      ? { ...finalRunData({ groups, now, run: item.run }), finishedAt: item.run.finishedAt ?? now }
      : counters,
  });
}
