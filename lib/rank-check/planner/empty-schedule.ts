import "server-only";
import { prisma } from "@/lib/db/prisma";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { activeMarketLocationIds, runnableKeywordWhere } from "@/lib/rank-check/runnable";

/** Retire only unstarted occurrences; keep the schedule available for new members. */
export function skipEmptyScheduleOccurrences(
  schedule: { id: string; projectId: string },
  now: Date,
) {
  return prisma.$transaction(async (tx) => {
    await lockProjectForProviderMutation(tx, schedule.projectId);
    const activeLocations = await activeMarketLocationIds(schedule.projectId, tx);
    const members = await tx.keyword.count({
      where: {
        ...runnableKeywordWhere(activeLocations),
        checkScheduleId: schedule.id,
        projectId: schedule.projectId,
      },
    });
    if (members > 0) return;
    await tx.rankCheckRun.updateMany({
      data: {
        blockedReason: "no_active_keywords",
        estimatedCostCents: 0,
        finishedAt: now,
        keywordCount: 0,
        outcome: "deferred",
        status: "completed",
        targetCount: 0,
        totalCount: 0,
      },
      where: {
        checkScheduleId: schedule.id,
        projectId: schedule.projectId,
        launchedAt: null,
        startedAt: null,
        status: { in: ["planned", "blocked"] },
        items: { none: {} },
      },
    });
  });
}
