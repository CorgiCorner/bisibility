import "server-only";

import { ApiNotFoundError } from "@/lib/api/errors";
import type { Prisma } from "@/lib/generated/prisma/client";
import { type CheckScheduleRow, checkScheduleSelect } from "./service-membership";

export async function requireSchedule(
  tx: Prisma.TransactionClient,
  projectId: string,
  publicId: string,
) {
  const schedule = await tx.checkSchedule.findFirst({
    select: checkScheduleSelect,
    where: { archivedAt: null, projectId, publicId },
  });
  if (!schedule) throw new ApiNotFoundError("Check schedule not found.");
  return schedule;
}

export async function projectTimezone(tx: Prisma.TransactionClient, projectId: string) {
  const project = await tx.project.findUnique({
    select: { defaults: { select: { timezone: true } } },
    where: { id: projectId },
  });
  return project?.defaults?.timezone ?? "UTC";
}

export function cadenceChanged(before: CheckScheduleRow, after: CheckScheduleRow) {
  return (
    before.cronExpression !== after.cronExpression ||
    before.enabled !== after.enabled ||
    before.frequency !== after.frequency ||
    before.jitterMinutes !== after.jitterMinutes ||
    before.timeOfDay !== after.timeOfDay ||
    before.timezone !== after.timezone
  );
}

export function storedCronExpression(
  frequency: CheckScheduleRow["frequency"],
  cronExpression: string | null,
  normalizedCronExpression: string | null,
) {
  return frequency === "weekly" || frequency === "monthly"
    ? cronExpression
    : normalizedCronExpression;
}
