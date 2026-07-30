"use server";

import { getKeywordDepthDecreaseWarning } from "@/lib/alerts/depth-conflict.server";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import type { RankCheckFrequency } from "@/lib/generated/prisma/client";
import { refreshKeywordDispatchStates } from "@/lib/rank-check/dispatcher-state";
import { keywordScheduleUpdateSchema } from "@/lib/schemas/keyword";
import { normalizeSchedule } from "./_schedule";
import { getActionActor, parseActionInput, requireKeywordScope } from "./_shared";
import { revalidateKeywords } from "./keyword-helpers";

type ScheduleViewInput = {
  cronExpression: string | null;
  frequency: RankCheckFrequency;
  jitterMinutes: number;
  lastCheckedAt: Date | null;
  nextCheckAt: Date | null;
  serpDepth: number | null;
  timezone: string;
};

function iso(date: Date | null | undefined) {
  return date ? date.toISOString() : null;
}

function scheduleView(schedule: ScheduleViewInput) {
  return {
    cron_expression: schedule.cronExpression,
    frequency: schedule.frequency,
    jitter_minutes: schedule.jitterMinutes,
    last_checked_at: iso(schedule.lastCheckedAt),
    next_check_at: iso(schedule.nextCheckAt),
    serp_depth: schedule.serpDepth,
    timezone: schedule.timezone,
  };
}

export async function updateKeywordSchedule(input: unknown) {
  const data = parseActionInput(keywordScheduleUpdateSchema, input);
  const actor = await getActionActor();
  const keyword = await requireKeywordScope(actor, "update", data.keywordId);
  const before = await prisma.keywordSchedule.findUnique({ where: { keywordId: keyword.id } });
  const schedule = normalizeSchedule(data, new Date(), keyword.id);
  const warning = await getKeywordDepthDecreaseWarning(keyword.id, data.serpDepth);
  const stored = await prisma.$transaction(async (tx) => {
    const updated = await tx.keywordSchedule.upsert({
      create: { ...schedule, keywordId: keyword.id },
      select: {
        cronExpression: true,
        frequency: true,
        jitterMinutes: true,
        lastCheckedAt: true,
        nextCheckAt: true,
        serpDepth: true,
        timezone: true,
      },
      update: schedule,
      where: { keywordId: keyword.id },
    });
    await refreshKeywordDispatchStates({ keywordIds: [keyword.id] }, tx);
    return updated;
  });

  await writeAudit({
    action: "keyword_schedule.update",
    actorId: actor.id,
    after: schedule,
    before,
    projectId: keyword.projectId,
    targetId: keyword.publicId,
    targetType: "keyword_schedule",
  });
  revalidateKeywords(keyword.publicId);

  return { ...scheduleView(stored), warning };
}
