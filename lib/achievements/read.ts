import "server-only";
import { prisma } from "@/lib/db/prisma";
import { calendarDay, shiftDay } from "./calendar";
import { achievementsEnabled } from "./config";
import { achievementMailAvailable } from "./mail-availability";
import { type AchievementView, isShareableBadgeKind } from "./schema";
import {
  progressForThirtyDays,
  THIRTY_DAYS_DEFINITION_VERSION,
  THIRTY_DAYS_KIND,
} from "./thirty-days";

const empty = () => ({ current: 0, longest: 0, days: [] as string[] });
export async function readAchievements(userId: string): Promise<AchievementView | null> {
  if (!achievementsEnabled()) return null;
  const now = new Date();
  const state = await prisma.achievementState.findUnique({ where: { userId } });
  const timeZone = state?.timeZone ?? "UTC",
    today = calendarDay(now, timeZone);
  const epoch = state?.epoch ?? 1;
  const [days, awards, enrollment, memberships] = await Promise.all([
    prisma.achievementDay.findMany({
      where: { userId, epoch, localDay: { gte: shiftDay(today, -6) } },
      select: { kind: true, localDay: true },
    }),
    prisma.achievementAward.findMany({ where: { userId }, orderBy: { earnedAt: "asc" } }),
    prisma.achievementEnrollment.findUnique({
      where: {
        userId_kind_definitionVersion: {
          userId,
          kind: THIRTY_DAYS_KIND,
          definitionVersion: THIRTY_DAYS_DEFINITION_VERSION,
        },
      },
    }),
    prisma.membership.findMany({
      where: { userId },
      select: { project: { select: { publicId: true, name: true } } },
      orderBy: { project: { name: "asc" } },
    }),
  ]);
  const practiceSinceJoin = enrollment
    ? await prisma.achievementDay.findMany({
        where: {
          userId,
          epoch,
          kind: "practice",
          localDay: { gte: enrollment.joinedOn },
        },
        select: { localDay: true },
      })
    : [];
  const thirty = enrollment
    ? progressForThirtyDays({
        joinedOn: enrollment.joinedOn,
        leftOn: enrollment.leftAt ? calendarDay(enrollment.leftAt, enrollment.timeZone) : null,
        practiceDays: practiceSinceJoin.map((day) => day.localDay),
        today,
      })
    : null;
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
    awards: awards.flatMap((award) =>
      isShareableBadgeKind(award.kind)
        ? [
            {
              kind: award.kind,
              earnedAt: award.earnedAt.toISOString(),
              earnedDay: award.earnedDay,
              published: !!award.shareTokenHash,
            },
          ]
        : [],
    ),
    thirtyDays: thirty
      ? {
          joinedOn: thirty.joinedOn,
          leftOn: thirty.leftOn,
          dayNumber: thirty.dayNumber,
          earned: thirty.earned,
          paused: thirty.paused,
          overflowDays: thirty.overflowDays,
          slots: thirty.slots,
        }
      : {
          joinedOn: null,
          leftOn: null,
          dayNumber: 0,
          earned: false,
          paused: false,
          overflowDays: 0,
          slots: [],
        },
    snapshotProjects: memberships.map((membership) => membership.project),
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
