import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma, type RankCheckFrequency } from "@/lib/generated/prisma/client";

export type SchedulerUpgradeConflict = {
  internalKeywordId: string;
  internalProjectId: string;
  keywordId: string;
  keywordText: string;
  projectId: string;
  projectWriteMode: string;
  ownerDeactivated: boolean;
  keywordArchived: boolean;
  reason:
    | "missing_assignment"
    | "invalid_assignment"
    | "archived_schedule"
    | "legacy_override_mismatch";
  legacyFrequency: RankCheckFrequency;
  legacySerpDepth: number | null;
  legacyTimezone: string;
  projectTimezone: string;
  legacyJitterMinutes: number;
  legacyCronExpression: string | null;
  scheduleId: string | null;
  scheduleName: string | null;
  scheduleFrequency: RankCheckFrequency | null;
  scheduleTimezone: string | null;
  scheduleJitterMinutes: number | null;
  scheduleCronExpression: string | null;
};

// Retain intent for inactive projects/accounts and archived keywords too: they can return.
export function readSchedulerUpgradeConflicts(
  database: Pick<typeof prisma, "$queryRaw"> = prisma,
  projectId?: string,
) {
  return database.$queryRaw<SchedulerUpgradeConflict[]>(Prisma.sql`
    SELECT k.id AS "internalKeywordId", p.id AS "internalProjectId",
      k."publicId" AS "keywordId", k.text AS "keywordText", p."publicId" AS "projectId", p."writeMode"::text AS "projectWriteMode",
      (owner."deactivatedAt" IS NOT NULL) AS "ownerDeactivated",
      (k."archivedAt" IS NOT NULL) AS "keywordArchived",
      CASE WHEN cs.id IS NULL AND k."checkScheduleId" IS NULL THEN 'missing_assignment'
        WHEN cs.id IS NULL THEN 'invalid_assignment'
        WHEN cs."archivedAt" IS NOT NULL THEN 'archived_schedule'
        ELSE 'legacy_override_mismatch' END AS reason,
      COALESCE(ks.frequency, pd.frequency, 'manual')::text AS "legacyFrequency",
      ks."serpDepth" AS "legacySerpDepth",
      COALESCE(ks.timezone, pd.timezone, 'UTC') AS "legacyTimezone",
      COALESCE(pd.timezone, 'UTC') AS "projectTimezone",
      COALESCE(ks."jitterMinutes", pd."jitterMinutes", 60) AS "legacyJitterMinutes",
      CASE WHEN ks.id IS NOT NULL THEN ks."cronExpression" ELSE pd."cronExpression" END AS "legacyCronExpression",
      cs."publicId" AS "scheduleId", cs.name AS "scheduleName", cs.frequency::text AS "scheduleFrequency",
      cs.timezone AS "scheduleTimezone", cs."jitterMinutes" AS "scheduleJitterMinutes",
      cs."cronExpression" AS "scheduleCronExpression"
    FROM keywords k JOIN projects p ON p.id = k."projectId"
    JOIN users owner ON owner.id = p."ownerId"
    LEFT JOIN keyword_schedules ks ON ks."keywordId" = k.id
    LEFT JOIN project_defaults pd ON pd."projectId" = p.id
    LEFT JOIN check_schedules cs ON cs.id = k."checkScheduleId" AND cs."projectId" = p.id
    WHERE ((cs.id IS NULL AND (k."checkScheduleId" IS NOT NULL OR
      COALESCE(ks.frequency, pd.frequency, 'manual')::text IN ('daily', 'weekly', 'monthly', 'custom_cron')))
      OR (cs.id IS NOT NULL AND cs."archivedAt" IS NOT NULL)
      OR (cs.id IS NOT NULL AND ks.id IS NOT NULL AND (
        ks.frequency::text IS DISTINCT FROM CASE WHEN cs.enabled THEN cs.frequency::text ELSE 'paused' END
        OR ks.timezone IS DISTINCT FROM COALESCE(cs.timezone, pd.timezone, 'UTC')
        OR ks."jitterMinutes" IS DISTINCT FROM cs."jitterMinutes"
        OR (cs.frequency = 'custom_cron' AND ks."cronExpression" IS DISTINCT FROM cs."cronExpression")))
    ) ${projectId ? Prisma.sql`AND p.id = ${projectId}` : Prisma.empty}
    ORDER BY k.id
  `);
}

export function publicUpgradeConflict({
  internalKeywordId: _keyword,
  internalProjectId: _project,
  ...conflict
}: SchedulerUpgradeConflict) {
  return {
    ...conflict,
    resolution:
      conflict.reason === "missing_assignment"
        ? "Preview --dry-run --repair-assignments. If no unique match exists, create the intended schedule in this project's Schedules screen in cutover mode, then retry."
        : "In cutover mode, use this project's Schedules screen to reassign the keyword or edit the selected schedule to the intended legacy settings; stop the app and preview again.",
  };
}
