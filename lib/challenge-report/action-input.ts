import { z } from "zod";
import { isDateKey, MAX_CHALLENGE_DAYS } from "./period";
import { challengeLessonsSchema } from "./schema";

const projectId = z.string().trim().min(1).max(120);
const start = z.string().refine(isDateKey);
const days = z.number().int().min(1).max(MAX_CHALLENGE_DAYS);

export const challengeReportCreateSchema = z
  .object({
    days,
    includeWork: z.boolean().optional(),
    journey: z.boolean().optional(),
    projectId,
    start,
    requestId: z.uuid().optional(),
    title: z.string().trim().min(1).max(160),
  })
  .strict();

export const challengeReportPreviewSchema = z
  .object({
    days,
    includeWork: z.boolean().optional(),
    journey: z.boolean().optional(),
    projectId,
    start,
  })
  .strict();

export const challengeReportRefreshSchema = z
  .object({
    projectId,
    reportId: z.string().trim().min(1).max(40),
  })
  .strict();

export const challengeReportLessonsActionSchema = challengeReportRefreshSchema
  .extend({
    lessons: challengeLessonsSchema,
  })
  .strict();
