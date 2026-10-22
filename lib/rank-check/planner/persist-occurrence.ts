import "server-only";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { activeMarketLocationIds, runnableKeywordWhere } from "@/lib/rank-check/runnable";
import type { plannedOccurrences } from "./occurrence";
import { cancelledOccurrenceReplacement } from "./occurrence-replacement";
import type { PlannerSchedule } from "./plan";
import { scheduledRunMembers } from "./schedule-members";

export async function persistOccurrence(
  schedule: PlannerSchedule,
  occurrence: ReturnType<typeof plannedOccurrences>[number],
  now = new Date(),
) {
  const baseKey = `plan:${schedule.publicId}:${occurrence.occurrenceKey}`;
  return prisma.$transaction(async (tx) => {
    await lockProjectForProviderMutation(tx, schedule.projectId);
    const locations = await activeMarketLocationIds(schedule.projectId, tx);
    const current = await tx.checkSchedule.findFirst({
      where: {
        id: schedule.id,
        archivedAt: null,
        enabled: true,
        frequency: schedule.frequency,
        cronExpression: schedule.cronExpression,
        timeOfDay: schedule.timeOfDay,
        timezone: schedule.timezone,
        jitterMinutes: schedule.jitterMinutes,
        keywords: { some: runnableKeywordWhere(locations) },
      },
      select: { id: true },
    });
    if (!current) return null;
    const existing = await tx.rankCheckRun.findUnique({
      select: { id: true, status: true },
      where: {
        projectId_idempotencyKey: { idempotencyKey: baseKey, projectId: schedule.projectId },
      },
    });
    const replacement =
      existing && ["completed", "cancelled"].includes(existing.status)
        ? await cancelledOccurrenceReplacement(tx, {
            projectId: schedule.projectId,
            scheduleId: schedule.id,
            occurrenceKey: occurrence.occurrenceKey,
            baseKey,
            deferred: {
              now,
              occurrence,
              selectionHash: scheduledRunMembers(schedule.keywords).selectionHash,
            },
          })
        : null;
    if (existing && !replacement) return null;
    const idempotencyKey = replacement?.idempotencyKey ?? baseKey;
    const publicId = makePublicId("rcr");
    const members = scheduledRunMembers(schedule.keywords);
    const run = await tx.rankCheckRun.upsert({
      create: {
        checkScheduleId: schedule.id,
        estimatedCostCents: 0,
        idempotencyKey,
        keywordCount: 0,
        orchestrationWorkflowId: `rank-check-run-${publicId}`,
        plannedFor: occurrence.plannedFor,
        projectId: schedule.projectId,
        publicId,
        requestedCount: 0,
        selectionHash: members.selectionHash,
        selectionKind: "scheduled_due",
        selectionSpec: {
          checkScheduleId: schedule.publicId,
          kind: "scheduled_due",
          occurrenceKey: occurrence.occurrenceKey,
          ...(replacement?.replacesCancelledRunPublicId
            ? { replacesCancelledRunPublicId: replacement.replacesCancelledRunPublicId }
            : {}),
          ...(replacement?.replacesDeferredRunPublicId
            ? { replacesDeferredRunPublicId: replacement.replacesDeferredRunPublicId }
            : {}),
          v: 1,
        },
        status: "planned",
        targetCount: 0,
        totalCount: 0,
        trigger: "scheduled",
      },
      update: {},
      where: { projectId_idempotencyKey: { idempotencyKey, projectId: schedule.projectId } },
    });
    return run.id;
  });
}
