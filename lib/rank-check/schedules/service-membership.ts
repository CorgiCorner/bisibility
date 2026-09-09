import "server-only";

import { normalizeSchedule } from "@/lib/actions/_schedule";
import { keywordIdsWhere } from "@/lib/actions/keyword-helpers";
import { ApiNotFoundError } from "@/lib/api/errors";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { Prisma, type RankCheckFrequency } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { refreshKeywordDispatchStates } from "@/lib/rank-check/dispatcher-state";
import { reconcilePlannedRunsForSchedule } from "@/lib/rank-check/planner/reconcile-schedule";
import type { CheckScheduleMembershipInput } from "@/lib/schemas/check-schedule";
import { createId } from "@paralleldrive/cuid2";

export type CheckScheduleRow = {
  archivedAt?: Date | null;
  cronExpression: string | null;
  enabled: boolean;
  frequency: RankCheckFrequency;
  id: string;
  isDefault: boolean;
  jitterMinutes: number;
  name: string;
  providerPolicy: string | null;
  publicId: string;
  serpDepth: number | null;
  timeOfDay: string | null;
  timezone: string | null;
};

export const checkScheduleSelect = {
  archivedAt: true,
  cronExpression: true,
  enabled: true,
  frequency: true,
  id: true,
  isDefault: true,
  jitterMinutes: true,
  name: true,
  providerPolicy: true,
  publicId: true,
  serpDepth: true,
  timeOfDay: true,
  timezone: true,
} as const;

const CADENCE_MIRROR_BATCH_SIZE = 500;

export function checkScheduleAudit(schedule: CheckScheduleRow) {
  return {
    archivedAt: schedule.archivedAt?.toISOString() ?? null,
    cronExpression: schedule.cronExpression,
    enabled: schedule.enabled,
    frequency: schedule.frequency,
    isDefault: schedule.isDefault,
    jitterMinutes: schedule.jitterMinutes,
    name: schedule.name,
    providerPolicy: schedule.providerPolicy,
    publicId: schedule.publicId,
    serpDepth: schedule.serpDepth,
    timeOfDay: schedule.timeOfDay,
    timezone: schedule.timezone,
  };
}

async function getProjectTimezone(tx: Prisma.TransactionClient, projectId: string) {
  const project = await tx.project.findUnique({
    select: { defaults: { select: { timezone: true } } },
    where: { id: projectId },
  });
  return project?.defaults?.timezone ?? "UTC";
}

async function upsertKeywordCadences(
  tx: Prisma.TransactionClient,
  keywordIds: string[],
  cadenceForKeyword: (keywordId: string) => ReturnType<typeof normalizeSchedule>,
  now: Date,
) {
  for (let offset = 0; offset < keywordIds.length; offset += CADENCE_MIRROR_BATCH_SIZE) {
    const values = keywordIds.slice(offset, offset + CADENCE_MIRROR_BATCH_SIZE).map((keywordId) => {
      const cadence = cadenceForKeyword(keywordId);
      return Prisma.sql`(
        ${createId()}, ${keywordId}, ${cadence.frequency}::"RankCheckFrequency", ${cadence.cronExpression},
        ${cadence.timezone}, ${cadence.jitterMinutes}, ${cadence.nextCheckAt}, ${now}, ${now}
      )`;
    });
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "keyword_schedules" (
        "id", "keywordId", "frequency", "cronExpression", "timezone", "jitterMinutes",
        "nextCheckAt", "createdAt", "updatedAt"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("keywordId") DO UPDATE SET
        "frequency" = EXCLUDED."frequency",
        "cronExpression" = EXCLUDED."cronExpression",
        "timezone" = EXCLUDED."timezone",
        "jitterMinutes" = EXCLUDED."jitterMinutes",
        "nextCheckAt" = EXCLUDED."nextCheckAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `);
  }
}

export async function mirrorScheduleToKeywords(
  tx: Prisma.TransactionClient,
  projectId: string,
  schedule: CheckScheduleRow,
  keywordIds: string[],
) {
  const timezone = schedule.timezone ?? (await getProjectTimezone(tx, projectId));
  const now = new Date();
  await upsertKeywordCadences(
    tx,
    keywordIds,
    (keywordId) =>
      normalizeSchedule(
        {
          cronExpression: schedule.enabled ? schedule.cronExpression : null,
          frequency: schedule.enabled ? schedule.frequency : "paused",
          jitterMinutes: schedule.jitterMinutes,
          timezone,
        },
        now,
        keywordId,
      ),
    now,
  );
  await refreshKeywordDispatchStates({ keywordIds }, tx);
}

export async function mirrorManualToKeywords(
  tx: Prisma.TransactionClient,
  projectId: string,
  keywordIds: string[],
) {
  const timezone = await getProjectTimezone(tx, projectId);
  const now = new Date();
  await upsertKeywordCadences(
    tx,
    keywordIds,
    (keywordId) =>
      normalizeSchedule(
        { cronExpression: null, frequency: "manual", jitterMinutes: 60, timezone },
        now,
        keywordId,
      ),
    now,
  );
  await refreshKeywordDispatchStates({ keywordIds }, tx);
  return { cronExpression: null, frequency: "manual" as const, jitterMinutes: 60, timezone };
}

async function requireSchedule(tx: Prisma.TransactionClient, projectId: string, publicId: string) {
  const schedule = await tx.checkSchedule.findFirst({
    select: checkScheduleSelect,
    where: { archivedAt: null, projectId, publicId },
  });
  if (!schedule) throw new ApiNotFoundError("Check schedule not found.");
  return schedule;
}

export async function assignKeywordsToSchedule(
  actorId: string,
  projectId: string,
  data: CheckScheduleMembershipInput,
) {
  return prisma.$transaction(
    async (tx) => {
      await lockProjectForProviderMutation(tx, projectId);
      const schedule = await requireSchedule(tx, projectId, data.scheduleId);
      const candidates = await tx.keyword.findMany({
        select: {
          checkScheduleId: true,
          checkSchedule: { select: { publicId: true } },
          id: true,
          publicId: true,
        },
        where: keywordIdsWhere(projectId, data.keywordIds),
      });
      const moved = candidates.filter((keyword) => keyword.checkScheduleId !== schedule.id);
      const keywordIds = moved.map((keyword) => keyword.id);
      if (keywordIds.length > 0) {
        await tx.keyword.updateMany({
          data: { checkScheduleId: schedule.id },
          where: { id: { in: keywordIds } },
        });
      }
      await mirrorScheduleToKeywords(tx, projectId, schedule, keywordIds);
      const affectedScheduleIds = [
        schedule.id,
        ...moved.flatMap((keyword) => keyword.checkScheduleId ?? []),
      ];
      for (const affectedScheduleId of new Set(affectedScheduleIds)) {
        await reconcilePlannedRunsForSchedule(affectedScheduleId, tx);
      }
      const movedFrom = [
        ...new Set(moved.flatMap((keyword) => keyword.checkSchedule?.publicId ?? [])),
      ];
      await writeAudit(
        {
          action: "check_schedule.assign",
          actorId,
          after: {
            ...checkScheduleAudit(schedule),
            keywordIds: moved.map((keyword) => keyword.publicId),
            movedFrom,
          },
          projectId,
          targetId: requiredPublicAuditId(schedule.publicId, "sch", "Check schedule"),
          targetType: "check_schedule",
        },
        tx,
      );
      return { updated: moved.length };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

export async function removeKeywordsFromSchedule(
  actorId: string,
  projectId: string,
  data: CheckScheduleMembershipInput,
) {
  return prisma.$transaction(
    async (tx) => {
      await lockProjectForProviderMutation(tx, projectId);
      const schedule = await requireSchedule(tx, projectId, data.scheduleId);
      const moved = await tx.keyword.findMany({
        select: { id: true, publicId: true },
        where: { ...keywordIdsWhere(projectId, data.keywordIds), checkScheduleId: schedule.id },
      });
      const keywordIds = moved.map((keyword) => keyword.id);
      if (keywordIds.length > 0) {
        await tx.keyword.updateMany({
          data: { checkScheduleId: null },
          where: { id: { in: keywordIds } },
        });
      }
      const manual = await mirrorManualToKeywords(tx, projectId, keywordIds);
      await reconcilePlannedRunsForSchedule(schedule.id, tx);
      await writeAudit(
        {
          action: "check_schedule.remove",
          actorId,
          after: {
            ...manual,
            keywordIds: moved.map((keyword) => keyword.publicId),
            movedFrom: moved.length > 0 ? [schedule.publicId] : [],
          },
          projectId,
          targetId: requiredPublicAuditId(schedule.publicId, "sch", "Check schedule"),
          targetType: "check_schedule",
        },
        tx,
      );
      return { updated: moved.length };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}
