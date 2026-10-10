import "server-only";
import { launchTrackingRun } from "@/lib/ai-tracking/admission/launch";
import type { PlanTrackingRunInput } from "@/lib/ai-tracking/contract";
import { payloadHash } from "@/lib/ai-tracking/identity";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id-resources";
import { nextTrackingOccurrence, trackingOccurrenceKey } from "./occurrences";

export async function planDueTrackingSchedules(now = new Date()) {
  const schedules = await prisma.aiTrackingSchedule.findMany({
    where: {
      enabled: true,
      archivedAt: null,
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
    },
    take: 100,
    orderBy: { id: "asc" },
  });
  let planned = 0;
  let skipped = 0;
  for (const schedule of schedules) {
    const next = nextTrackingOccurrence(schedule.cron, schedule.timezone, now);
    const advance = () =>
      prisma.aiTrackingSchedule.updateMany({
        where: { id: schedule.id, enabled: true, archivedAt: null, nextRunAt: schedule.nextRunAt },
        data: { nextRunAt: next },
      });
    if (!schedule.nextRunAt) {
      await advance();
      continue;
    }
    const configuration = schedule.configuration as unknown as PlanTrackingRunInput;
    const input: PlanTrackingRunInput = {
      ...configuration,
      idempotencyKey: trackingOccurrenceKey(schedule.id, schedule.nextRunAt),
      scheduleId: schedule.id,
      plannedAt: schedule.nextRunAt.toISOString(),
      origin: "scheduled",
      entrySource: "worker",
      deadline: new Date(schedule.nextRunAt.getTime() + 72 * 3600_000).toISOString(),
    };
    const active = await prisma.aiPrompt.findMany({
      where: {
        projectId: schedule.projectId,
        archivedAt: null,
        pausedAt: null,
        OR: [{ topicId: null }, { topic: { archivedAt: null, pausedAt: null } }],
        id: { in: input.promptIds },
      },
      select: { id: true },
    });
    if (!active.length || now.getTime() - schedule.nextRunAt.getTime() > 5 * 60_000) {
      await prisma.aiTrackingRun.upsert({
        where: {
          projectId_idempotencyKey: {
            projectId: schedule.projectId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        update: {},
        create: {
          projectId: schedule.projectId,
          actorId: input.actorId,
          publicId: makePublicId("air"),
          scheduleId: schedule.id,
          plannedAt: schedule.nextRunAt,
          idempotencyKey: input.idempotencyKey,
          payloadHash: payloadHash(input),
          launchPayload: JSON.parse(JSON.stringify(input)),
          competitorSnapshot: [],
          state: "skipped",
          finishedAt: now,
        },
      });
      skipped += 1;
      await advance();
      continue;
    }
    try {
      await launchTrackingRun(schedule.projectId, {
        ...input,
        promptIds: active.map((prompt) => prompt.id),
        consent: true,
      });
      planned += 1;
    } catch {
      // A failed admission advances the occurrence; it cannot initiate a paid catch-up.
      await prisma.aiTrackingRun.upsert({
        where: {
          projectId_idempotencyKey: {
            projectId: schedule.projectId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        update: {},
        create: {
          projectId: schedule.projectId,
          actorId: input.actorId,
          publicId: makePublicId("air"),
          scheduleId: schedule.id,
          plannedAt: schedule.nextRunAt,
          idempotencyKey: input.idempotencyKey,
          payloadHash: payloadHash(input),
          launchPayload: JSON.parse(JSON.stringify(input)),
          competitorSnapshot: [],
          state: "blocked",
          finishedAt: now,
        },
      });
    }
    await advance();
  }
  return { planned, skipped };
}
