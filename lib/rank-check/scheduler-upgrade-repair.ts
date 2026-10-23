import "server-only";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { Prisma } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { keywordScheduleSchema } from "@/lib/schemas/keyword";
import { readSchedulerUpgradeConflicts } from "./scheduler-upgrade-conflicts";
import { deriveScheduleTimeOfDay } from "./schedules/migrate";

// Restore missing membership only. Existing named schedules remain authoritative.
export async function repairMissingScheduleAssignments(
  apply: boolean,
  database = prisma,
  options: {
    createMissing?: boolean;
    selectMatches?: Record<string, string>;
    automatic?: boolean;
  } = {},
) {
  return database.$transaction(
    async (tx) => {
      if (options.automatic)
        await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(1649, 2)::text`);
      let conflicts = await readSchedulerUpgradeConflicts(tx);
      if (options.automatic) {
        const projects = new Set(
          conflicts
            .filter((row) => row.reason === "missing_assignment")
            .map((row) => row.internalProjectId),
        );
        for (const projectId of [...projects].sort())
          await lockProjectForProviderMutation(tx, projectId);
        // Re-read after UI mutations commit; manual choices must not be recovered from stale intent.
        conflicts = (await readSchedulerUpgradeConflicts(tx)).filter((row) =>
          projects.has(row.internalProjectId),
        );
      }
      const assignments = [];
      const newSchedules = new Map<string, object>();
      const missing = conflicts.filter((row) => row.reason === "missing_assignment");
      for (const keywordId of Object.keys(options.selectMatches ?? {})) {
        if (!missing.some((row) => row.keywordId === keywordId))
          throw new Error(`No missing assignment for ${keywordId}; preview again.`);
      }
      for (const conflict of missing) {
        if (
          options.automatic &&
          !keywordScheduleSchema.safeParse({
            frequency: conflict.legacyFrequency,
            serpDepth: conflict.legacySerpDepth,
            timezone: conflict.legacyTimezone,
            jitterMinutes: conflict.legacyJitterMinutes,
            cronExpression: conflict.legacyCronExpression,
          }).success
        )
          continue;
        const schedules = await tx.checkSchedule.findMany({
          where: {
            projectId: conflict.internalProjectId,
            archivedAt: null,
            enabled: true,
            serpDepth: conflict.legacySerpDepth,
            providerPolicy: null,
            frequency: conflict.legacyFrequency,
            jitterMinutes: conflict.legacyJitterMinutes,
          },
        });
        const matches = schedules.filter(
          (schedule) =>
            (schedule.timezone ?? conflict.projectTimezone) === conflict.legacyTimezone &&
            schedule.timeOfDay ===
              deriveScheduleTimeOfDay(conflict.legacyFrequency, conflict.legacyCronExpression) &&
            (conflict.legacyFrequency !== "custom_cron" ||
              schedule.cronExpression === conflict.legacyCronExpression),
        );
        const selected = options.selectMatches?.[conflict.keywordId];
        let match = selected
          ? matches.find((schedule) => schedule.publicId === selected)
          : matches.length === 1
            ? matches[0]
            : undefined;
        if (selected && !match)
          throw new Error(
            `Selected schedule ${selected} does not preserve legacy intent for ${conflict.keywordId}.`,
          );
        let wouldCreate = false;
        if (!matches.length && options.createMissing) {
          const data = {
            projectId: conflict.internalProjectId,
            name: `Recovered ${conflict.legacyFrequency} (${conflict.legacyTimezone}${conflict.legacySerpDepth === null ? "" : `, depth ${conflict.legacySerpDepth}`})`,
            frequency: conflict.legacyFrequency,
            serpDepth: conflict.legacySerpDepth,
            timezone: conflict.legacyTimezone,
            jitterMinutes: conflict.legacyJitterMinutes,
            cronExpression:
              conflict.legacyFrequency === "custom_cron" ? conflict.legacyCronExpression : null,
            timeOfDay: deriveScheduleTimeOfDay(
              conflict.legacyFrequency,
              conflict.legacyCronExpression,
            ),
            enabled: true,
            isDefault: false,
          };
          const key = JSON.stringify(data);
          newSchedules.set(key, { ...data, projectId: conflict.projectId });
          wouldCreate = true;
          if (apply)
            match = await tx.checkSchedule.create({
              data: { ...data, publicId: makePublicId("sch") },
            });
        }
        let assigned = false;
        if (apply && match) {
          const result = await tx.keyword.updateMany({
            where: {
              id: conflict.internalKeywordId,
              projectId: conflict.internalProjectId,
              checkScheduleId: null,
            },
            data: { checkScheduleId: match.id },
          });
          if (result.count !== 1)
            throw new Error(`Assignment changed for ${conflict.keywordId}; preview again.`);
          assigned = true;
        }
        assignments.push({
          keywordId: conflict.keywordId,
          projectId: conflict.projectId,
          matches: matches.map((schedule) => ({ id: schedule.publicId, name: schedule.name })),
          resolution: wouldCreate
            ? "create_schedule"
            : selected
              ? "selected_match"
              : match
                ? "unique_match"
                : matches.length
                  ? "multiple_matches"
                  : "no_match",
          scheduleId: match?.publicId ?? null,
          assigned,
        });
      }
      const remainingConflicts = apply
        ? (await readSchedulerUpgradeConflicts(tx)).map((row) => row.keywordId)
        : [
            ...conflicts
              .filter((row) => row.reason !== "missing_assignment")
              .map((row) => row.keywordId),
            ...assignments
              .filter((row) => ["no_match", "multiple_matches"].includes(row.resolution))
              .map((row) => row.keywordId),
          ];
      return {
        applied: apply,
        assignments,
        newSchedules: [...newSchedules.values()],
        remainingConflicts,
      };
    },
    { timeout: 60_000 },
  );
}
