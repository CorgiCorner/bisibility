import { isPublicIdOfType } from "@/lib/db/public-id";
import { z } from "zod";

// Shared with client forms. Keep provider implementations and server runtime imports out.
export const projectIdSchema = z
  .string()
  .refine((value) => isPublicIdOfType(value, "prj"), "Project not found.");
export const scheduleIdSchema = z
  .string()
  .refine((value) => isPublicIdOfType(value, "sch"), "Check schedule not found.");
export const scheduleTargetSchema = z
  .object({
    projectId: projectIdSchema,
    scheduleId: scheduleIdSchema,
  })
  .strict();

export const restoreCheckScheduleSchema = scheduleTargetSchema;
export const archiveCheckScheduleSchema = scheduleTargetSchema.extend({
  destinationScheduleId: scheduleIdSchema.nullable(),
});
