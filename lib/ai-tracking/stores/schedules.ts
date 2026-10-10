import { scheduleInputSchema } from "@/lib/ai-tracking/schema";
import { makePublicId } from "@/lib/db/public-id-resources";
import { CronExpressionParser } from "cron-parser";
import { jsonInput, lockTrackingProject, prisma, requireFound } from "./shared";
import type { ScheduleInput } from "./signatures";

export function listSchedules(projectId: string) {
  return prisma.aiTrackingSchedule.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}
function validateSchedule(cron: string, timezone: string) {
  new Intl.DateTimeFormat("en", { timeZone: timezone });
  CronExpressionParser.parse(cron, { tz: timezone });
}
export function createSchedule(projectId: string, input: ScheduleInput) {
  const data = scheduleInputSchema.parse(input);
  validateSchedule(data.cron, data.timezone);
  return prisma.$transaction(async (tx) => {
    await lockTrackingProject(tx, projectId);
    return tx.aiTrackingSchedule.create({
      data: {
        ...data,
        projectId,
        publicId: makePublicId("ais"),
        configuration: jsonInput(data.configuration),
        nextRunAt: data.nextRunAt ? new Date(data.nextRunAt) : null,
        enabled: data.enabled ?? false,
      },
    });
  });
}
export function updateSchedule(
  projectId: string,
  scheduleId: string,
  input: Partial<ScheduleInput>,
) {
  const data = scheduleInputSchema.partial().parse(input);
  return prisma.$transaction(async (tx) => {
    await lockTrackingProject(tx, projectId);
    const schedule = requireFound(
      await tx.aiTrackingSchedule.findFirst({
        where: { projectId, id: scheduleId, archivedAt: null },
      }),
      "Schedule",
    );
    validateSchedule(data.cron ?? schedule.cron, data.timezone ?? schedule.timezone);
    return tx.aiTrackingSchedule.update({
      where: { id: scheduleId },
      data: {
        ...data,
        configuration: data.configuration === undefined ? undefined : jsonInput(data.configuration),
        nextRunAt:
          data.nextRunAt === undefined
            ? data.enabled !== undefined || data.cron !== undefined || data.timezone !== undefined
              ? null
              : undefined
            : data.nextRunAt === null
              ? null
              : new Date(data.nextRunAt),
      },
    });
  });
}
export function archiveSchedule(projectId: string, scheduleId: string) {
  return prisma.$transaction(async (tx) => {
    await lockTrackingProject(tx, projectId);
    const schedule = requireFound(
      await tx.aiTrackingSchedule.findFirst({ where: { projectId, id: scheduleId } }),
      "Schedule",
    );
    return tx.aiTrackingSchedule.update({
      where: { id: scheduleId },
      data: { enabled: false, archivedAt: schedule.archivedAt ?? new Date() },
    });
  });
}
