import { z } from "zod";
import { validTimeZone } from "./calendar";
export const preferenceSchema = z.object({
  enabled: z.boolean(),
  showHeader: z.boolean(),
  emailEnabled: z.boolean(),
  timeZone: z.string().min(1).max(80).refine(validTimeZone),
  restartCalendar: z.boolean(),
  revision: z.number().int().nonnegative(),
});
export const shareSchema = z.object({
  kind: z.enum(["presence", "practice"]),
  published: z.boolean(),
});
export type AchievementPreferences = z.infer<typeof preferenceSchema>;
export type AchievementView = {
  available: boolean;
  enabled: boolean;
  showHeader: boolean;
  emailEnabled: boolean;
  emailAvailable?: boolean;
  timeZone: string;
  epoch: number;
  revision: number;
  today: string;
  presence: { current: number; longest: number; days: string[] };
  practice: { current: number; longest: number; days: string[] };
  awards: Array<{
    kind: "presence" | "practice";
    earnedAt: string;
    earnedDay: string;
    published: boolean;
  }>;
};
