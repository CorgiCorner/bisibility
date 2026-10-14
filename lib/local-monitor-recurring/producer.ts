import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { LocalDatabase } from "@/lib/local-monitoring-store/context";
import { recurringMonitorsEnabled } from "./config";
import { produceRecurringOccurrence } from "./produce-one";
/** Called by existing worker sweep only. No additional timer, cron or direct provider I/O. */
export async function produceDueRecurringMonitors(
  options: { db?: LocalDatabase; clock?: () => Date } = {},
) {
  if (!recurringMonitorsEnabled())
    return { enabled: false, queued: 0, blocked: 0, skipped: 0, retained: 0 };
  const db = options.db ?? prisma,
    now = (options.clock ?? (() => new Date()))();
  // Exclude precisely retained targets before LIMIT; the project-locked producer still rechecks races.
  const rows = await db.$queryRaw<Array<{ id: string }>>`SELECT c."approvalId" AS id
    FROM local_monitor_recurring_cursors c
    JOIN local_monitor_recurring_approvals a ON a.id=c."approvalId" AND a."projectId"=c."projectId"
    WHERE c.state='active' AND c."nextDueAt"<=${now}
    AND NOT EXISTS(
      SELECT 1 FROM local_measurement_target_owners o
      JOIN local_measurement_targets t ON t.id=o."targetId" AND t."projectId"=o."projectId"
      WHERE o."projectId"=c."projectId" AND (a.snapshot->'targetIds') ? t."publicId"
    )
    AND NOT EXISTS(
      SELECT 1 FROM local_monitor_launch_intents j
      CROSS JOIN LATERAL jsonb_array_elements_text(j.command->'targetIds') target(value)
      WHERE j."projectId"=c."projectId" AND j.state IN ('queued','running')
      AND (a.snapshot->'targetIds') ? target.value
    )
    ORDER BY c."nextDueAt",c."approvalId" LIMIT 25`;
  const outcomes = [];
  for (const row of rows) outcomes.push(await produceRecurringOccurrence(row.id, db, now));
  return {
    enabled: true,
    queued: outcomes.filter((v) => v === "queued").length,
    blocked: outcomes.filter((v) => v === "blocked").length,
    skipped: outcomes.filter((v) => v === "skipped").length,
    retained: outcomes.filter((v) => v === "target_retained").length,
  };
}
