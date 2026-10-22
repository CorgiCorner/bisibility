import "server-only";
import { prisma } from "@/lib/db/prisma";
import { calendarDay, shiftDay } from "./calendar";
import { achievementsEnabled } from "./config";
import { achievementMailAvailable } from "./mail-availability";
import type { AchievementView } from "./schema";

const empty = () => ({ current: 0, longest: 0, days: [] as string[] });
export async function readAchievements(userId: string): Promise<AchievementView | null> {
  if (!achievementsEnabled()) return null;
  const now = new Date();
  const state = await prisma.achievementState.findUnique({ where: { userId } });
  const timeZone = state?.timeZone ?? "UTC",
    today = calendarDay(now, timeZone);
  const [days, awards] = await Promise.all([
    prisma.achievementDay.findMany({
      where: { userId, epoch: state?.epoch ?? 1, localDay: { gte: shiftDay(today, -6) } },
      select: { kind: true, localDay: true },
    }),
    prisma.achievementAward.findMany({ where: { userId }, orderBy: { earnedAt: "asc" } }),
  ]);
  const live = (last: string | null, value: number) =>
    last && last >= shiftDay(today, -1) ? value : 0;
  return {
    available: true,
    enabled: state?.enabled ?? true,
    showHeader: state?.showHeader ?? true,
    emailEnabled: state?.emailEnabled ?? true,
    emailAvailable: await achievementMailAvailable(),
    timeZone,
    epoch: state?.epoch ?? 1,
    revision: state?.revision ?? 0,
    today,
    presence: state
      ? {
          current: live(state.presenceLastDay, state.presenceCurrent),
          longest: state.presenceLongest,
          days: days.filter((d) => d.kind === "presence").map((d) => d.localDay),
        }
      : empty(),
    practice: state
      ? {
          current: live(state.practiceLastDay, state.practiceCurrent),
          longest: state.practiceLongest,
          days: days.filter((d) => d.kind === "practice").map((d) => d.localDay),
        }
      : empty(),
    awards: awards
      .filter((a) => a.kind === "presence" || a.kind === "practice")
      .map((a) => ({
        kind: a.kind as "presence" | "practice",
        earnedAt: a.earnedAt.toISOString(),
        earnedDay: a.earnedDay,
        published: !!a.shareTokenHash,
      })),
  };
}

/** The header flame counts consecutive days with a visit (presence), like the day indicator. */
export async function readAchievementHeader(userId: string) {
  if (!achievementsEnabled()) return null;
  const state = await prisma.achievementState.findUnique({
    where: { userId },
    select: {
      enabled: true,
      showHeader: true,
      timeZone: true,
      presenceCurrent: true,
      presenceLastDay: true,
    },
  });
  const timeZone = state?.timeZone ?? "UTC",
    today = calendarDay(new Date(), timeZone);
  return {
    enabled: state?.enabled ?? true,
    showHeader: state?.showHeader ?? true,
    timeZone,
    current:
      state?.presenceLastDay && state.presenceLastDay >= shiftDay(today, -1)
        ? state.presenceCurrent
        : 0,
  };
}
