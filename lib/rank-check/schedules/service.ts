import { prepareResourceCapacity } from "@/lib/capacity/capacity-extension";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { assertDefinitionActor } from "@/lib/measurement-definitions/access";
import type { ReviewedConsentSummary } from "@/lib/measurement-settings/host/reviewed-consent";
import "server-only";

import { normalizeSchedule } from "@/lib/actions/_schedule";
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
  checkScheduleAudit,
  checkScheduleSelect,
  mirrorScheduleToKeywords,
} from "./service-membership";
import {
  cadenceChanged,
  projectTimezone,
  requireSchedule,
  storedCronExpression,
} from "./service-row";

export class CheckScheduleNotEmptyError extends Error {
  readonly code = "check_schedule_not_empty";

  constructor() {
    super("Move or remove all keywords before deleting this schedule.");
    this.name = "CheckScheduleNotEmptyError";
  }
}

export async function createSchedule(
  actorId: string,
  projectId: string,
  data: CreateCheckScheduleInput,
  existingTx?: Prisma.TransactionClient,
) {
  const run = async (tx: Prisma.TransactionClient) => {
    await prepareResourceCapacity(tx, { projectId: projectId, dimensions: [] });
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
    const capacity = await prepareResourceCapacity(tx, {
      projectId,
      dimensions: [],
      cadence: {
        dimension: "scheduleFrequencies",
        after: { ...cadence, enabled: true },
      },
    });
    const schedule = await tx.checkSchedule.create({
      data: {
        cronExpression,
        enabled: true,
        frequency: cadence.frequency,
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
    await capacity.check();
    return { publicId: schedule.publicId };
  };
  return existingTx
    ? run(existingTx)
    : prisma.$transaction(run, { maxWait: 10_000, timeout: 60_000 });
}

export async function updateScheduleInTransaction(
  tx: Prisma.TransactionClient,
  actorId: string,
  projectId: string,
  data: UpdateCheckScheduleInput,
  consent?: ReviewedConsentSummary,
  clientConsent?: string,
) {
  await assertDefinitionActor(tx, actorId, projectId, "update", "check_schedule");
  await prepareResourceCapacity(tx, { projectId: projectId, dimensions: [] });
  await lockProjectForProviderMutation(tx, projectId);
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { writeMode: true },
  });
  if (project?.writeMode !== "active") throw new ProjectReadOnlyError(projectId);
  const before = await requireSchedule(tx, projectId, data.scheduleId);
  const storedTimezone = data.timezone === undefined ? before.timezone : data.timezone;
  const resolvedTimezone = storedTimezone ?? (await projectTimezone(tx, projectId));
  const cadence = normalizeSchedule({
    cronExpression: data.cronExpression === undefined ? before.cronExpression : data.cronExpression,
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
  const capacity = await prepareResourceCapacity(tx, {
    projectId,
    dimensions: ["scheduledKeywords"],
    cadence: {
      dimension: "scheduleFrequencies",
      before,
      after: { ...cadence, enabled: data.enabled ?? before.enabled },
    },
  });
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
    await reconcilePlannedRunsForSchedule(schedule.id, tx, { invalidateMaterialized: true });
  }
  await writeAudit(
    {
      action: "check_schedule.update",
      actorId,
      after: {
        ...checkScheduleAudit(schedule),
        ...(consent ? { consent } : {}),
        ...(clientConsent ? { clientConsent } : {}),
      },
      before: checkScheduleAudit(before),
      projectId,
      targetId: requiredPublicAuditId(schedule.publicId, "sch", "Check schedule"),
      targetType: "check_schedule",
    },
    tx,
  );
  await capacity.check();
  return { publicId: schedule.publicId };
}
export async function updateSchedule(
  actorId: string,
  projectId: string,
  data: UpdateCheckScheduleInput,
  existingTx?: Prisma.TransactionClient,
  clientConsent?: string,
) {
  const run = (tx: Prisma.TransactionClient) =>
    updateScheduleInTransaction(tx, actorId, projectId, data, undefined, clientConsent);
  return existingTx
    ? run(existingTx)
    : prisma.$transaction(run, { maxWait: 10_000, timeout: 60_000 });
}

export async function deleteSchedule(actorId: string, projectId: string, scheduleId: string) {
  return prisma.$transaction(
    async (tx) => {
      await prepareResourceCapacity(tx, { projectId: projectId, dimensions: [] });
      await lockProjectForProviderMutation(tx, projectId);
      const schedule = await requireSchedule(tx, projectId, scheduleId);
      const members = await tx.keyword.findMany({
        select: { id: true },
        where: { checkScheduleId: schedule.id },
      });
      if (members.length > 0) throw new CheckScheduleNotEmptyError();
      await reconcilePlannedRunsForSchedule(schedule.id, tx, { deleting: true });
      await tx.checkSchedule.delete({ where: { id: schedule.id } });
      await writeAudit(
        {
          action: "check_schedule.delete",
          actorId,
          after: {
            keywordIds: [],
            movedTo: null,
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
