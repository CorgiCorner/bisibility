import "server-only";
import { prisma } from "@/lib/db/prisma";

export async function completeWithoutItems(input: {
  keywordCount: number;
  now: Date;
  requestedCount: number;
  runId: string;
  selectionHash: string;
  status: string;
}) {
  return prisma.$transaction(async (tx) => {
    const completed = await tx.rankCheckRun.updateMany({
      data: {
        blockedReason: null,
        estimatedCostCents: 0,
        finishedAt: input.now,
        keywordCount: input.keywordCount,
        launchedAt: input.now,
        outcome: "deferred",
        requestedCount: input.requestedCount,
        selectionHash: input.selectionHash,
        skippedCount: input.requestedCount,
        startedAt: null,
        status: "completed",
        targetCount: 0,
        totalCount: 0,
      },
      where: { id: input.runId, status: input.status },
    });
    return completed.count > 0 ? ("deferred" as const) : ("not_ready" as const);
  });
}
