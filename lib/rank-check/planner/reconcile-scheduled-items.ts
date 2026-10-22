import "server-only";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { Prisma } from "@/lib/generated/prisma/client";
import { cancelUnrunnableRunItem } from "@/lib/rank-check/runs/cancel";
import {
  type PlannerScheduleCadence,
  plannedOccurrenceForKey,
  selectionOccurrenceKey,
} from "./occurrence";

type PendingScheduleItem = PlannerScheduleCadence & {
  archivedAt: Date | null;
  enabled: boolean;
  id: string;
  keywordPublicId: string;
  keywordScheduleId: string | null;
  plannedFor: Date | null;
  projectId: string;
  requestedCount: number;
  runId: string;
  runPublicId: string;
  selectionSpec: Prisma.JsonValue;
  status: string;
};

/** Caller holds the project mutation lock. Claimed or linked work is never cancelled here. */
export async function cancelObsoleteScheduleItems(
  tx: Prisma.TransactionClient,
  scheduleId: string,
  options: { deleting?: boolean; invalidateMaterialized?: boolean } = {},
  now = new Date(),
) {
  const rows = await tx.$queryRaw<PendingScheduleItem[]>(Prisma.sql`
    SELECT item.id, run.id AS "runId", run."publicId" AS "runPublicId",
      run."projectId", run."requestedCount", run.status, run."plannedFor", run."selectionSpec",
      keyword."publicId" AS "keywordPublicId", keyword."checkScheduleId" AS "keywordScheduleId",
      schedule."publicId", schedule."archivedAt", schedule.enabled, schedule.frequency,
      schedule."cronExpression", schedule."timeOfDay", schedule."jitterMinutes",
      COALESCE(schedule.timezone, defaults.timezone, 'UTC') AS timezone
    FROM rank_check_run_items item
    JOIN rank_check_runs run ON run.id = item."runId"
    JOIN keywords keyword ON keyword.id = item."keywordId" AND keyword."projectId" = run."projectId"
    JOIN check_schedules schedule ON schedule.id = run."checkScheduleId" AND schedule."projectId" = run."projectId"
    LEFT JOIN project_defaults defaults ON defaults."projectId" = run."projectId"
    WHERE run."checkScheduleId" = ${scheduleId}
      AND run.trigger = 'scheduled' AND run."selectionKind" = 'scheduled_due'
      AND run.status IN ('queued', 'running')
      AND item.status = 'queued' AND item."rankCheckId" IS NULL
    ORDER BY run.id, item.id
    FOR UPDATE OF run, item
  `);
  let cancelled = 0;
  for (const row of rows) {
    const key = selectionOccurrenceKey(row.selectionSpec);
    const occurrence =
      row.enabled && !row.archivedAt && key ? plannedOccurrenceForKey(row, key) : null;
    const current =
      !options.deleting &&
      !options.invalidateMaterialized &&
      row.keywordScheduleId === scheduleId &&
      occurrence !== null &&
      row.plannedFor !== null &&
      occurrence.plannedFor.getTime() === row.plannedFor.getTime();
    if (current) continue;
    const changed = await cancelUnrunnableRunItem(tx, {
      itemId: row.id,
      now,
      queuedOnly: true,
      reason: "schedule_changed",
      run: {
        id: row.runId,
        projectId: row.projectId,
        requestedCount: row.requestedCount,
        status: row.status,
      },
    });
    if (!changed) continue;
    cancelled += 1;
    await writeAudit(
      {
        action: "rank_check_run.item_cancelled",
        actorId: null,
        after: {
          itemId: row.id,
          keywordId: requiredPublicAuditId(row.keywordPublicId, "kw", "Rank-check"),
          reason: "schedule_changed",
        },
        projectId: row.projectId,
        targetId: requiredPublicAuditId(row.runPublicId, "rcr", "Rank-check run"),
        targetType: "rank_check_run",
      },
      tx,
    );
  }
  return { cancelled };
}
