import { parseCronExpression } from "@/lib/rank-check/cron";
import { monthDays, weekdays } from "@/lib/rank-check/schedule-calendar";
import { isSupportedProjectTimezone } from "@/lib/settings/timezones";
import { z } from "zod";

export const measurementSelectionSchema = z
  .object({
    providerId: z.string().min(1).max(120),
    capabilityVersion: z.string().min(1).max(128),
    surface: z.enum(["web_serp", "maps", "local_finder"]),
    geoId: z.string().min(1).max(256),
    languageCode: z.string().min(1).max(40),
    device: z.enum(["desktop", "mobile"]),
    depth: z.number().int().positive(),
  })
  .strict();
export const scheduleDraftSchema = z
  .object({
    enabled: z.boolean(),
    frequency: z.enum(["daily", "weekly", "monthly", "custom_cron"]),
    timezone: z.string().min(1).max(80).refine(isSupportedProjectTimezone),
    timeOfDay: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):(?:00|30)$/u)
      .nullable(),
    weekday: z.enum(weekdays).nullable(),
    dayOfMonth: z
      .string()
      .refine((value) => monthDays.includes(value))
      .nullable(),
    cronExpression: z.string().max(120),
    jitterMinutes: z.number().int().min(0).max(120),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.frequency === "custom_cron" && !parseCronExpression(value.cronExpression).ok)
      context.addIssue({ code: "custom", path: ["cronExpression"], message: "invalid_cron" });
  });
export const measurementDraftFormSchema = z
  .object({ selection: measurementSelectionSchema, schedule: scheduleDraftSchema.nullable() })
  .strict();
