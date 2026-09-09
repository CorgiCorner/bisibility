import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { runnableKeywordSql } from "@/lib/rank-check/runnable";
import { SCHEDULED_FREQUENCIES } from "@/lib/rank-check/schedule-frequency";
import { DEFAULT_STALE_RUNNING_CHECK_MINUTES } from "@/lib/rank-check/stale-window";

export type RankScheduleHeartbeat = {
  activeSchedules: number;
  activeScheduledKeywords: number;
  plannedOverdue: number;
  oldestPlannedFor: string | null;
  tracked: number;
};

type ScheduleAggregate = Omit<RankScheduleHeartbeat, "oldestPlannedFor"> & {
  oldestPlannedFor: Date | null;
};

export async function collectRankScheduleHeartbeat(
  now: Date,
  database: Pick<PrismaClient, "$queryRaw"> = prisma,
): Promise<RankScheduleHeartbeat> {
  // Fixed diagnostic grace, not proof that the configurable planner has missed an execution.
  const cutoff = new Date(now.getTime() - DEFAULT_STALE_RUNNING_CHECK_MINUTES * 60_000);
  // Project/sample exclusions describe expected work; they do not perform planner admission.
  const [summary] = await database.$queryRaw<ScheduleAggregate[]>(Prisma.sql`
    WITH eligible_keywords AS MATERIALIZED (
      SELECT k.id, k."projectId", k."checkScheduleId"
      FROM "keywords" k
      JOIN "projects" project ON project.id = k."projectId"
      JOIN "users" owner ON owner.id = project."ownerId"
      WHERE ${runnableKeywordSql("k")}
        AND owner."deactivatedAt" IS NULL
        AND project."writeMode" = 'active'
        AND project."isSample" = false
    ), scheduled_keywords AS MATERIALIZED (
      SELECT k.id, k."projectId", schedule.id AS "checkScheduleId"
      FROM eligible_keywords k
      JOIN "check_schedules" schedule
        ON schedule.id = k."checkScheduleId" AND schedule."projectId" = k."projectId"
      WHERE schedule."archivedAt" IS NULL
        AND schedule.enabled = true
        AND schedule.frequency IN (${Prisma.join([...SCHEDULED_FREQUENCIES])})
    ), overdue_runs AS (
      SELECT run."plannedFor"
      FROM "rank_check_runs" run
      WHERE run.trigger = 'scheduled'
        AND run."selectionKind" = 'scheduled_due'
        AND run.status = 'planned'
        AND run."plannedFor" < ${cutoff}::timestamp(3)
        AND EXISTS (
          SELECT 1 FROM scheduled_keywords keyword
          WHERE keyword."checkScheduleId" = run."checkScheduleId"
            AND keyword."projectId" = run."projectId"
        )
    )
    SELECT
      (SELECT COUNT(DISTINCT "checkScheduleId")::int FROM scheduled_keywords) AS "activeSchedules",
      (SELECT COUNT(DISTINCT id)::int FROM scheduled_keywords) AS "activeScheduledKeywords",
      (SELECT COUNT(*)::int FROM overdue_runs) AS "plannedOverdue",
      (SELECT MIN("plannedFor") FROM overdue_runs) AS "oldestPlannedFor",
      (SELECT COUNT(*)::int FROM eligible_keywords) AS tracked
  `);
  if (!summary) throw new Error("Rank schedule heartbeat aggregate is unavailable.");

  return { ...summary, oldestPlannedFor: summary.oldestPlannedFor?.toISOString() ?? null };
}
