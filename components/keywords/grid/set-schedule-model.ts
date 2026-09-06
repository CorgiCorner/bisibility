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
    day: z.enum(["Monday", "Thursday"]),
    frequency: z.enum(["daily", "weekly", "monthly", "custom_cron"]),
    jitterMinutes: z.coerce.number().int().min(0).max(120),
    mode: z.enum(["choose", "new"]),
    name: z.string().trim().min(1).max(80),
    timeOfDay: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    timezone: z.string().trim().min(1).max(80).refine(isSupportedProjectTimezone),
  })
  .strict();

export type NewScheduleValues = z.infer<typeof newScheduleSchema>;
