"use server";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import type { RankCheckFrequency } from "@/lib/generated/prisma/client";
import { requireTrackedDomain } from "@/lib/projects/tracked-domain";
import { refreshKeywordDispatchStates } from "@/lib/rank-check/dispatcher-state";
import { manualRunCheckNow } from "@/lib/rank-check/manual-run";
import type { RunCheckNowResult } from "@/lib/rank-check/manual-run-result";
import { isScheduledFrequency, SCHEDULED_FREQUENCIES } from "@/lib/rank-check/schedule";
import { queueFirstChecksSchema } from "@/lib/schemas/keyword";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateRankCheckViews,
} from "./_shared";

export type { RunCheckNowResult };

export type QueueFirstChecksResult = { queued: number } | { queued: 0; reason: "no_provider" };

const scheduleSelect = {
  cronExpression: true,
  frequency: true,
  jitterMinutes: true,
  lastCheckedAt: true,
  timezone: true,
} as const;

type FirstCheckSchedule = {
  cronExpression: string | null;
  frequency: RankCheckFrequency;
  jitterMinutes: number;
  lastCheckedAt: Date | null;
  timezone: string;
};

function canQueueFirstCheck(schedule: Pick<FirstCheckSchedule, "frequency"> | null) {
  return Boolean(schedule && isScheduledFrequency(schedule.frequency));
}

function inheritedFirstCheckSchedule(defaults: FirstCheckSchedule, keywordId: string, now: Date) {
  return {
    cronExpression: defaults.cronExpression,
    frequency: defaults.frequency,
    jitterMinutes: defaults.jitterMinutes,
    keywordId,
    lastCheckedAt: defaults.lastCheckedAt,
    nextCheckAt: now,
    timezone: defaults.timezone,
  };
}

export async function queueFirstChecks(input: unknown): Promise<QueueFirstChecksResult> {
  const data = parseActionInput(queueFirstChecksSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "keyword" });
  requireTrackedDomain(project);
  const providerCount = await prisma.providerConnection.count({
    where: { enabled: true, kind: "serp", projectId: project.id, status: "connected" },
  });

  if (providerCount === 0) {
    const result = { queued: 0, reason: "no_provider" } as const;
    await writeAudit({
      action: "rank_check.queue_first",
      actorId: actor.id,
      after: result,
      projectId: project.id,
      targetId: project.publicId,
      targetType: "project",
    });
    revalidateRankCheckViews();
    return result;
  }

  const now = new Date();
  const excludedKeywordIds = data.excludeKeywordIds ?? [];
  if (excludedKeywordIds.some((keywordId) => parsePublicId(keywordId)?.prefix !== "kw")) {
    throw new Error("Keyword not found.");
  }
  const keywordIdFilter =
    excludedKeywordIds.length > 0 ? { publicId: { notIn: excludedKeywordIds } } : {};
  const defaults = await prisma.projectDefaults.findUnique({
    select: scheduleSelect,
    where: { projectId: project.id },
  });
  const [scheduledKeywords, inheritedKeywords] = await Promise.all([
    prisma.keyword.findMany({
      select: { id: true },
      where: {
        ...keywordIdFilter,
        projectId: project.id,
        schedule: {
          is: {
            frequency: { in: [...SCHEDULED_FREQUENCIES] },
          },
        },
      },
    }),
    canQueueFirstCheck(defaults)
      ? prisma.keyword.findMany({
          select: { id: true },
          // Previewed keywords persisted their own schedule update; re-queueing
          // them here would trigger an immediate duplicate check.
          where: { ...keywordIdFilter, projectId: project.id, schedule: null },
        })
      : Promise.resolve([]),
  ]);
  const scheduledIds = scheduledKeywords.map((keyword) => keyword.id);
  const inheritedIds = inheritedKeywords.map((keyword) => keyword.id);

  const keywordIds = [...scheduledIds, ...inheritedIds];
  await prisma.$transaction(async (tx) => {
    if (scheduledIds.length > 0) {
      await tx.keywordSchedule.updateMany({
        data: { nextCheckAt: now },
        where: { keywordId: { in: scheduledIds } },
      });
    }
    if (defaults && inheritedIds.length > 0) {
      await tx.keywordSchedule.createMany({
        data: inheritedIds.map((keywordId) =>
          inheritedFirstCheckSchedule(defaults, keywordId, now),
        ),
        skipDuplicates: true,
      });
    }
    await refreshKeywordDispatchStates({ keywordIds }, tx);
  });
  await writeAudit({
    action: "rank_check.queue_first",
    actorId: actor.id,
    after: { queued: keywordIds.length },
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project",
  });
  revalidateRankCheckViews();

  return { queued: keywordIds.length };
}

// A direct re-export is illegal in a "use server" file (only async functions may
// be exported), so wrap the manual-run entry point in an async function.
export async function runCheckNow(input: unknown): Promise<RunCheckNowResult> {
  return manualRunCheckNow(input);
}
