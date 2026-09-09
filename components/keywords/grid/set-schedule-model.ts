import { parseCronExpression } from "@/lib/rank-check/cron";
import { calendarCronExpression, monthDays, weekdays } from "@/lib/rank-check/schedule-calendar";
import type { createCheckScheduleSchema } from "@/lib/schemas/check-schedule";
import type { RankCheckFrequency } from "@/lib/settings/options";
import { isSupportedProjectTimezone } from "@/lib/settings/timezones";
import { z } from "zod";

export type CheckScheduleSummary = Readonly<{
  cronExpression: string | null;
  dayOfMonth?: string | null;
  enabled: boolean;
  frequency: RankCheckFrequency;
  isDefault: boolean;
  jitterMinutes: number;
  keywordCount: number;
  name: string;
  publicId: string;
  serpDepth: number | null;
  timeOfDay: string | null;
  timezone: string | null;
  weekday?: string | null;
}>;

export type ModalView = "choose" | "new";
export type ScheduleChoice = string | "remove" | null;
export type ScheduleLoadState = "error" | "loaded" | "loading";

export const newScheduleSchema = z
  .object({
    choice: z.string().nullable(),
    cronExpression: z.string().trim().min(1).max(120),
    day: z.enum(weekdays),
    dayOfMonth: z.enum(monthDays),
    frequency: z.enum(["daily", "weekly", "monthly", "custom_cron"]),
    jitterMinutes: z.coerce.number().int().min(0).max(120),
    mode: z.enum(["choose", "new"]),
    name: z.string().trim().min(1).max(80),
    timeOfDay: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    timezone: z
      .string()
      .trim()
      .max(80)
      .refine(
        (value) => value === "" || isSupportedProjectTimezone(value),
        "Select a valid time zone.",
      ),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.mode === "new" &&
      value.frequency === "custom_cron" &&
      !parseCronExpression(value.cronExpression).ok
    ) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid five-field cron expression.",
        path: ["cronExpression"],
      });
    }
  });

export type NewScheduleValues = z.infer<typeof newScheduleSchema>;

export function newScheduleRequest(
  values: NewScheduleValues,
  projectId: string,
): z.input<typeof createCheckScheduleSchema> {
  return {
    cronExpression:
      values.frequency === "custom_cron"
        ? values.cronExpression
        : calendarCronExpression({ ...values, weekday: values.day }),
    frequency: values.frequency,
    jitterMinutes: values.jitterMinutes,
    name: values.name,
    projectId,
    providerPolicy: null,
    serpDepth: null,
    timeOfDay: values.frequency === "custom_cron" ? null : values.timeOfDay,
    timezone: values.timezone || null,
  };
}
