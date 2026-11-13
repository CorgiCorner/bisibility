import "server-only";

import { calendarDay } from "@/lib/achievements/calendar";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { baselinePageMembership, writeBaselinePageSnapshot } from "@/lib/pages/snapshot";
import { SEARCH_INSIGHTS_SEARCH_TYPE } from "@/lib/search-insights/constants";
import { dateFromKey } from "@/lib/search-insights/dates";
import { readSearchInsightsConnection } from "@/lib/search-insights/sync/credentials";
import { challengeProgress } from "./challenge-window";
import { projectSeoChallengeEnabled } from "./feature";
import { addDays, utcDateKey } from "./period";

const CHALLENGE_BASELINE_LABEL = "Challenge Day 1";

const challengeInclude = {
  checkIns: { select: { localDay: true } },
  days: { select: { localDay: true } },
  snapshot: { select: { pageCount: true, takenOn: true } },
} as const;

/**
 * A legacy `pausedAt` is ignored: manual pause was removed, and a paused
 * enrollment simply continues inside its fixed 30-day window. Verified work
 * days recorded before check-ins existed still count as checked-in days.
 */
export async function readProjectChallenge(userId: string, projectId: string) {
  if (!(await projectSeoChallengeEnabled())) return null;
  const row = await prisma.projectSeoChallenge.findUnique({
    where: { userId_projectId: { userId, projectId } },
    include: challengeInclude,
  });
  if (!row) return null;
  const today = calendarDay(new Date(), row.timeZone);
  const progress = challengeProgress({
    checkedDays: [...row.checkIns, ...row.days].map((day) => day.localDay),
    joinedOn: row.joinedOn,
    today,
  });
  return {
    /** Verified work days inside the window. Kept apart from check-ins. */
    workDays: row.days.filter(
      (day) => day.localDay >= progress.start && day.localDay <= progress.end,
    ).length,
    baselineClicks: row.baselineClicks,
    pageCount: row.snapshot.pageCount,
    snapshotId: row.snapshotId,
    baselineOn: utcDateKey(row.snapshot.takenOn),
    joinedOn: row.joinedOn,
    progress,
    today,
  };
}

async function baselineClicks(projectId: string, day: string) {
  const { connection } = await readSearchInsightsConnection(projectId);
  if (!connection) return null;
  const result = await prisma.searchAnalyticsDaily.aggregate({
    _sum: { clicks: true },
    where: {
      projectId,
      property: connection.property,
      searchType: SEARCH_INSIGHTS_SEARCH_TYPE,
      date: { gte: dateFromKey(addDays(day, -30)), lt: dateFromKey(day) },
    },
  });
  return result._sum.clicks;
}

/**
 * Explicit enrollment. The challenge's own Day 1 baseline, the enrollment and
 * the Day 1 check-in are written in one transaction, so a failed or racing
 * Start leaves nothing behind. The baseline is never the active Pages
 * comparison snapshot.
 */
export async function startProjectChallenge(input: {
  projectId: string;
  timeZone?: string;
  userId: string;
}) {
  if (!(await projectSeoChallengeEnabled())) return null;
  const where = { userId_projectId: { projectId: input.projectId, userId: input.userId } };
  const [existing, state] = await Promise.all([
    prisma.projectSeoChallenge.findUnique({ where, select: { id: true } }),
    prisma.achievementState.findUnique({ where: { userId: input.userId } }),
  ]);
  if (state?.enabled === false) return null;
  if (existing) return readProjectChallenge(input.userId, input.projectId);
  const now = new Date();
  const timeZone = state?.timeZone ?? input.timeZone ?? "UTC";
  const joinedOn = calendarDay(now, timeZone);
  const [membership, clicks] = await Promise.all([
    baselinePageMembership(input.projectId),
    baselineClicks(input.projectId, joinedOn),
  ]);
  try {
    await prisma.$transaction(async (tx) => {
      const baseline = await writeBaselinePageSnapshot(tx, {
        actorId: input.userId,
        label: CHALLENGE_BASELINE_LABEL,
        membership,
        now,
        projectId: input.projectId,
        takenOn: joinedOn,
      });
      const challenge = await tx.projectSeoChallenge.create({
        data: {
          baselineClicks: clicks,
          joinedOn,
          projectId: input.projectId,
          snapshotId: baseline.id,
          timeZone,
          userId: input.userId,
        },
        select: { id: true },
      });
      await tx.projectSeoChallengeCheckIn.create({
        data: { challengeId: challenge.id, localDay: joinedOn, source: "start" },
      });
    });
  } catch (error) {
    // A concurrent Start already enrolled this member; that enrollment stands.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
      throw error;
    }
  }
  return readProjectChallenge(input.userId, input.projectId);
}

export async function recordProjectChallengeWork(userId: string, projectId: string, at: Date) {
  if (!(await projectSeoChallengeEnabled())) return;
  const row = await prisma.projectSeoChallenge.findUnique({
    where: { userId_projectId: { userId, projectId } },
    select: { id: true, timeZone: true },
  });
  if (!row) return;
  const day = calendarDay(at, row.timeZone);
  await prisma.$executeRaw`
    INSERT INTO project_seo_challenge_days ("challengeId", "localDay")
    SELECT challenge.id, ${day}
    FROM project_seo_challenges challenge
    LEFT JOIN achievement_states state ON state."userId" = challenge."userId"
    WHERE challenge.id = ${row.id}
      AND challenge."joinedAt" <= ${at}
      AND COALESCE(state.enabled, true)
    ON CONFLICT DO NOTHING
  `;
}

export async function readProjectWorkDates(
  userId: string,
  projectId: string,
  period: { from: string; to: string },
) {
  const [challenge, preferences] = await Promise.all([
    prisma.projectSeoChallenge.findUnique({
      where: { userId_projectId: { userId, projectId } },
      select: {
        days: {
          select: { localDay: true },
          where: { localDay: { gte: period.from, lte: period.to } },
        },
      },
    }),
    prisma.achievementState.findUnique({ where: { userId }, select: { enabled: true } }),
  ]);
  return preferences?.enabled === false
    ? null
    : (challenge?.days.map((day) => day.localDay) ?? null);
}

export async function markProjectChallengeCardDownloaded(userId: string, projectId: string) {
  await prisma.projectSeoChallenge
    .updateMany({
      where: { userId, projectId, cardDownloadedAt: null },
      data: { cardDownloadedAt: new Date() },
    })
    .catch(() => console.error("[project-challenge] Could not record card download."));
}
