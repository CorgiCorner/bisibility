import { z } from "zod";
import { validTimeZone } from "./calendar";
import type { ThirtyDaySlot } from "./thirty-days";
export const preferenceSchema = z.object({
  enabled: z.boolean(),
  showHeader: z.boolean(),
  emailEnabled: z.boolean(),
  timeZone: z.string().min(1).max(80).refine(validTimeZone),
  restartCalendar: z.boolean(),
  revision: z.number().int().nonnegative(),
});
export const shareableBadgeKinds = ["presence", "practice", "thirty_days"] as const;
export type ShareableBadgeKind = (typeof shareableBadgeKinds)[number];
export function isShareableBadgeKind(kind: string): kind is ShareableBadgeKind {
  return (shareableBadgeKinds as readonly string[]).includes(kind);
}
export const shareSchema = z.object({
  kind: z.enum(shareableBadgeKinds),
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
    kind: ShareableBadgeKind;
    earnedAt: string;
    earnedDay: string;
    published: boolean;
  }>;
  thirtyDays?: {
    joinedOn: string | null;
    leftOn: string | null;
    dayNumber: number;
    earned: boolean;
    paused: boolean;
    overflowDays: number;
    slots: ThirtyDaySlot[];
  };
  snapshotProjects?: Array<{ publicId: string; name: string }>;
};
