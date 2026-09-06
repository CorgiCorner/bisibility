import "server-only";

import { normalizeSchedule } from "@/lib/actions/_schedule";
import { ApiNotFoundError } from "@/lib/api/errors";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { reconcilePlannedRunsForSchedule } from "@/lib/rank-check/planner/reconcile-schedule";
import type {
  CreateCheckScheduleInput,
  UpdateCheckScheduleInput,
} from "@/lib/schemas/check-schedule";
import {
  type CheckScheduleRow,
  checkScheduleAudit,
  checkScheduleSelect,
  mirrorScheduleToKeywords,
} from "./service-membership";

export class DefaultCheckScheduleDeletionError extends Error {
  readonly code = "default_check_schedule";

  constructor() {
    super("The default check schedule cannot be deleted.");
    this.name = "DefaultCheckScheduleDeletionError";
  }
}

async function requireSchedule(tx: Prisma.TransactionClient, projectId: string, publicId: string) {
  const schedule = await tx.checkSchedule.findFirst({
    select: checkScheduleSelect,
    where: { projectId, publicId },
  });
  if (!schedule) throw new ApiNotFoundError("Check schedule not found.");
  return schedule;
}

async function projectTimezone(tx: Prisma.TransactionClient, projectId: string) {
  const project = await tx.project.findUnique({
    select: { defaults: { select: { timezone: true } } },
    where: { id: projectId },
  });
  return project?.defaults?.timezone ?? "UTC";
}

function cadenceChanged(before: CheckScheduleRow, after: CheckScheduleRow) {
  return (
    before.cronExpression !== after.cronExpression ||
    before.enabled !== after.enabled ||
    before.frequency !== after.frequency ||
    before.jitterMinutes !== after.jitterMinutes ||
    before.timeOfDay !== after.timeOfDay ||
    before.timezone !== after.timezone
  );
}

function storedCronExpression(
  frequency: CheckScheduleRow["frequency"],
  cronExpression: string | null,
  normalizedCronExpression: string | null,
) {
  return frequency === "weekly" || frequency === "monthly"
    ? cronExpression
    : normalizedCronExpression;
}

export async function createSchedule(
  actorId: string,
  projectId: string,
  data: CreateCheckScheduleInput,
) {
  return prisma.$transaction(
    async (tx) => {
      await lockProjectForProviderMutation(tx, projectId);
      const timezone = data.timezone ?? (await projectTimezone(tx, projectId));
      const cadence = normalizeSchedule({
        cronExpression: data.cronExpression,
        frequency: data.frequency,
        jitterMinutes: data.jitterMinutes,
        timezone,
      });
      const cronExpression = storedCronExpression(
        data.frequency,
        data.cronExpression,
        cadence.cronExpression,
      );
      const schedule = await tx.checkSchedule.create({
        data: {
          cronExpression,
          enabled: true,
          frequency: cadence.frequency,
          isDefault: false,
          jitterMinutes: cadence.jitterMinutes,
          name: data.name,
          projectId,
          providerPolicy: data.providerPolicy ?? null,
          publicId: makePublicId("sch"),
          serpDepth: data.serpDepth ?? null,
          timeOfDay: data.timeOfDay ?? null,
          timezone: data.timezone ?? null,
        },
        select: checkScheduleSelect,
      });
      await writeAudit(
        {
          action: "check_schedule.create",
          actorId,
          after: checkScheduleAudit(schedule),
          projectId,
          targetId: requiredPublicAuditId(schedule.publicId, "sch", "Check schedule"),
          targetType: "check_schedule",
        },
        tx,
      );
      return { publicId: schedule.publicId };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

export async function updateSchedule(
  actorId: string,
  projectId: string,
  data: UpdateCheckScheduleInput,
) {
  return prisma.$transaction(
    async (tx) => {
      await lockProjectForProviderMutation(tx, projectId);
      const before = await requireSchedule(tx, projectId, data.scheduleId);
      const storedTimezone = data.timezone === undefined ? before.timezone : data.timezone;
      const resolvedTimezone = storedTimezone ?? (await projectTimezone(tx, projectId));
      const cadence = normalizeSchedule({
        cronExpression:
          data.cronExpression === undefined ? before.cronExpression : data.cronExpression,
        frequency: data.frequency ?? before.frequency,
        jitterMinutes: data.jitterMinutes ?? before.jitterMinutes,
        timezone: resolvedTimezone,
      });
      const frequency = data.frequency ?? before.frequency;
      const inputCronExpression =
        data.cronExpression === undefined ? before.cronExpression : data.cronExpression;
      const cronExpression = storedCronExpression(
        frequency,
        inputCronExpression,
        cadence.cronExpression,
      );
      const schedule = await tx.checkSchedule.update({
        data: {
          ...(data.enabled === undefined ? {} : { enabled: data.enabled }),
          ...(data.name === undefined ? {} : { name: data.name }),
          ...(data.providerPolicy === undefined ? {} : { providerPolicy: data.providerPolicy }),
          ...(data.serpDepth === undefined ? {} : { serpDepth: data.serpDepth }),
          ...(data.timeOfDay === undefined ? {} : { timeOfDay: data.timeOfDay }),
          ...(data.timezone === undefined ? {} : { timezone: data.timezone }),
          cronExpression,
          frequency: cadence.frequency,
          jitterMinutes: cadence.jitterMinutes,
        },
        select: checkScheduleSelect,
        where: { id: before.id },
      });
      if (cadenceChanged(before, schedule)) {
        const members = await tx.keyword.findMany({
          select: { id: true },
          where: { checkScheduleId: schedule.id },
        });
        await mirrorScheduleToKeywords(
          tx,
          projectId,
          schedule,
          members.map((keyword) => keyword.id),
        );
        await reconcilePlannedRunsForSchedule(schedule.id, tx);
      }
      await writeAudit(
        {
          action: "check_schedule.update",
          actorId,
          after: checkScheduleAudit(schedule),
          before: checkScheduleAudit(before),
          projectId,
          targetId: requiredPublicAuditId(schedule.publicId, "sch", "Check schedule"),
          targetType: "check_schedule",
        },
        tx,
      );
      return { publicId: schedule.publicId };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

export async function setDefaultSchedule(actorId: string, projectId: string, scheduleId: string) {
  return prisma.$transaction(
    async (tx) => {
      await lockProjectForProviderMutation(tx, projectId);
      const schedule = await requireSchedule(tx, projectId, scheduleId);
      const previous = await tx.checkSchedule.findFirst({
        select: { publicId: true },
        where: { isDefault: true, projectId },
      });
      await tx.checkSchedule.updateMany({
        data: { isDefault: false },
        where: { isDefault: true, projectId },
      });
      const updated = await tx.checkSchedule.update({
        data: { isDefault: true },
        select: checkScheduleSelect,
        where: { id: schedule.id },
      });
      await writeAudit(
        {
          action: "check_schedule.set_default",
          actorId,
          after: { publicId: updated.publicId },
          before: previous ? { publicId: previous.publicId } : null,
          projectId,
          targetId: requiredPublicAuditId(updated.publicId, "sch", "Check schedule"),
          targetType: "check_schedule",
        },
        tx,
      );
      return { publicId: updated.publicId };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

export async function deleteSchedule(actorId: string, projectId: string, scheduleId: string) {
  return prisma.$transaction(
    async (tx) => {
      await lockProjectForProviderMutation(tx, projectId);
      const schedule = await requireSchedule(tx, projectId, scheduleId);
      if (schedule.isDefault) throw new DefaultCheckScheduleDeletionError();
      const fallback = await tx.checkSchedule.findFirst({
        select: checkScheduleSelect,
        where: { isDefault: true, projectId },
      });
      if (!fallback) throw new ApiNotFoundError("Default check schedule not found.");
      const members = await tx.keyword.findMany({
        select: { id: true, publicId: true },
        where: { checkScheduleId: schedule.id },
      });
      const keywordIds = members.map((keyword) => keyword.id);
      if (keywordIds.length > 0) {
        await tx.keyword.updateMany({
          data: { checkScheduleId: fallback.id },
          where: { id: { in: keywordIds } },
        });
      }
      await mirrorScheduleToKeywords(tx, projectId, fallback, keywordIds);
      await reconcilePlannedRunsForSchedule(schedule.id, tx, { deleting: true });
      await reconcilePlannedRunsForSchedule(fallback.id, tx);
      await tx.checkSchedule.delete({ where: { id: schedule.id } });
      await writeAudit(
        {
          action: "check_schedule.delete",
          actorId,
          after: {
            keywordIds: members.map((keyword) => keyword.publicId),
            movedTo: fallback.publicId,
          },
          before: checkScheduleAudit(schedule),
          projectId,
          targetId: requiredPublicAuditId(schedule.publicId, "sch", "Check schedule"),
          targetType: "check_schedule",
        },
        tx,
      );
      return { deleted: true };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}
