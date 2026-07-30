import "server-only";

import { prisma } from "@/lib/db/prisma";
import { resolveEffectiveSchedule } from "@/lib/keywords/effective-schedule";
import { SCHEDULED_FREQUENCIES } from "@/lib/rank-check/schedule-frequency";

export type RankScheduleHeartbeat = {
  active: number;
  dueWithoutRun: number;
  tracked: number;
};

export async function collectRankScheduleHeartbeat(
  now: Date,
  since: Date,
): Promise<RankScheduleHeartbeat> {
  const projectWhere = { owner: { deactivatedAt: null }, writeMode: "active" as const };
  const [tracked, keywords] = await Promise.all([
    prisma.keyword.count({ where: { project: projectWhere } }),
    prisma.keyword.findMany({
      select: {
        id: true,
        project: {
          select: {
            defaults: {
              select: {
                cronExpression: true,
                frequency: true,
                jitterMinutes: true,
                nextCheckAt: true,
                timezone: true,
              },
            },
          },
        },
        rankChecks: {
          select: { scheduledAt: true },
          where: { scheduledAt: { gte: since, lte: now } },
        },
        schedule: {
          select: {
            cronExpression: true,
            frequency: true,
            jitterMinutes: true,
            nextCheckAt: true,
            timezone: true,
          },
        },
      },
      where: {
        OR: [
          { schedule: { is: { frequency: { in: [...SCHEDULED_FREQUENCIES] } } } },
          {
            project: {
              defaults: { is: { frequency: { in: [...SCHEDULED_FREQUENCIES] } } },
              ...projectWhere,
            },
            schedule: null,
          },
        ],
        project: projectWhere,
      },
    }),
  ]);
  const summary: RankScheduleHeartbeat = { active: 0, dueWithoutRun: 0, tracked };
  const firstDueAfter = new Date(since.getTime() - 1);

  for (const keyword of keywords) {
    const schedule = resolveEffectiveSchedule(
      keyword.schedule,
      keyword.project.defaults,
      keyword.id,
      firstDueAfter,
    );
    if (!schedule.runnable) continue;
    summary.active += 1;
    const dueAt = schedule.nextCheckAt;
    if (!dueAt || dueAt < since || dueAt > now) continue;
    const ranAfterDue = keyword.rankChecks.some(
      (rankCheck) => rankCheck.scheduledAt && rankCheck.scheduledAt >= dueAt,
    );
    if (!ranAfterDue) summary.dueWithoutRun += 1;
  }

  return summary;
}
