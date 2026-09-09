import "server-only";

import { ApiInputError, ApiNotFoundError } from "@/lib/api/errors";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { reconcilePlannedRunsForSchedule } from "@/lib/rank-check/planner/reconcile-schedule";
import {
  checkScheduleAudit,
  checkScheduleSelect,
  mirrorManualToKeywords,
  mirrorScheduleToKeywords,
} from "./service-membership";

async function findSchedule(tx: Prisma.TransactionClient, projectId: string, publicId: string) {
  const schedule = await tx.checkSchedule.findFirst({
    select: checkScheduleSelect,
    where: { projectId, publicId },
  });
  if (!schedule) throw new ApiNotFoundError("Check schedule not found.");
  return schedule;
}

export async function archiveSchedule(
  actorId: string,
  projectId: string,
  input: { scheduleId: string; destinationScheduleId: string | null },
) {
  return prisma.$transaction(
    async (tx) => {
      await lockProjectForProviderMutation(tx, projectId);
      const before = await findSchedule(tx, projectId, input.scheduleId);
      if (before.archivedAt) return { publicId: before.publicId };
      if (input.destinationScheduleId === input.scheduleId)
        throw new ApiInputError("Choose another schedule or manual checks.");
      const destination = input.destinationScheduleId
        ? await tx.checkSchedule.findFirst({
            select: checkScheduleSelect,
            where: { archivedAt: null, projectId, publicId: input.destinationScheduleId },
          })
        : null;
      if (input.destinationScheduleId && !destination)
        throw new ApiNotFoundError("Choose a current schedule for this project.");
      const members = await tx.keyword.findMany({
        select: { id: true, publicId: true },
        where: { projectId, checkScheduleId: before.id },
      });
      const keywordIds = members.map((keyword) => keyword.id);
      const after = await tx.checkSchedule.update({
        data: { archivedAt: new Date(), enabled: false, isDefault: false },
        select: checkScheduleSelect,
        where: { id: before.id },
      });
      if (keywordIds.length) {
        await tx.keyword.updateMany({
          data: { checkScheduleId: destination?.id ?? null },
          where: { id: { in: keywordIds }, projectId },
        });
        if (destination) await mirrorScheduleToKeywords(tx, projectId, destination, keywordIds);
        else await mirrorManualToKeywords(tx, projectId, keywordIds);
      }
      if (before.isDefault) {
        await tx.projectDefaults.upsert({
          where: { projectId },
          create: { projectId, frequency: "manual" },
          update: { frequency: "manual", cronExpression: null, nextCheckAt: null },
        });
      }
      // Accepted runs finish; future occurrences no longer belong in Upcoming.
      await reconcilePlannedRunsForSchedule(before.id, tx, { deleting: true });
      if (destination) await reconcilePlannedRunsForSchedule(destination.id, tx);
      await writeAudit(
        {
          action: "check_schedule.archive",
          actorId,
          projectId,
          before: checkScheduleAudit(before),
          after: {
            ...checkScheduleAudit(after),
            keywordIds: members.map((keyword) => keyword.publicId),
            movedTo: destination?.publicId ?? null,
          },
          targetId: requiredPublicAuditId(before.publicId, "sch", "Check schedule"),
          targetType: "check_schedule",
        },
        tx,
      );
      return { publicId: before.publicId };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

export async function restoreSchedule(actorId: string, projectId: string, scheduleId: string) {
  return prisma.$transaction(
    async (tx) => {
      await lockProjectForProviderMutation(tx, projectId);
      const before = await findSchedule(tx, projectId, scheduleId);
      if (!before.archivedAt) return { publicId: before.publicId };
      const after = await tx.checkSchedule.update({
        data: { archivedAt: null, enabled: false, isDefault: false },
        select: checkScheduleSelect,
        where: { id: before.id },
      });
      await writeAudit(
        {
          action: "check_schedule.restore",
          actorId,
          projectId,
          before: checkScheduleAudit(before),
          after: checkScheduleAudit(after),
          targetId: requiredPublicAuditId(before.publicId, "sch", "Check schedule"),
          targetType: "check_schedule",
        },
        tx,
      );
      return { publicId: before.publicId };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}
