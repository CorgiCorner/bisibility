import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { activeMarketLocationIds, runnableKeywordWhere } from "@/lib/rank-check/runnable";

type EmptyRunInput = {
  keywordCount: number;
  now: Date;
  requestedCount: number;
  runId: string;
  selectionHash: string;
  status: string;
  reason?: "no_active_keywords" | "targets_in_progress";
  projectId?: string;
  checkScheduleId?: string;
};

export async function completeWithoutItemsInTransaction(
  tx: Prisma.TransactionClient,
  input: EmptyRunInput,
) {
  if (input.projectId && input.checkScheduleId && input.reason === "no_active_keywords") {
    const locations = await activeMarketLocationIds(input.projectId, tx);
    const members = await tx.keyword.count({
      where: {
        ...runnableKeywordWhere(locations),
        projectId: input.projectId,
        checkScheduleId: input.checkScheduleId,
      },
    });
    if (members > 0) return "not_ready" as const;
  }
  const completed = await tx.rankCheckRun.updateMany({
    data: {
      blockedReason: input.reason ?? null,
      estimatedCostCents: 0,
      finishedAt: input.now,
      keywordCount: input.keywordCount,
      launchedAt: null,
      outcome: "deferred",
      requestedCount: input.requestedCount,
      selectionHash: input.selectionHash,
      skippedCount: input.requestedCount,
      startedAt: null,
      status: "completed",
      targetCount: 0,
      totalCount: 0,
    },
    where: {
      id: input.runId,
      status: input.status,
      launchedAt: null,
      startedAt: null,
      items: { none: {} },
    },
  });
  return completed.count > 0 ? ("deferred" as const) : ("not_ready" as const);
}

export function completeWithoutItems(input: EmptyRunInput) {
  return prisma.$transaction(async (tx) => {
    if (input.projectId && input.checkScheduleId && input.reason === "no_active_keywords") {
      await lockProjectForProviderMutation(tx, input.projectId);
    }
    return completeWithoutItemsInTransaction(tx, input);
  });
}
