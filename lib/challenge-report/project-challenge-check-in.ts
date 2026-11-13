import "server-only";

import { calendarDay } from "@/lib/achievements/calendar";
import { prisma } from "@/lib/db/prisma";
import { canMarkChallengeDay, challengeWindow, insideChallengeWindow } from "./challenge-window";
import { projectSeoChallengeEnabled } from "./feature";

export type ChallengeCheckInSource = "manual" | "visit";
export type ChallengeCheckInResult = "recorded" | "existing" | "invalid" | "skipped";

async function enrollment(userId: string, projectId: string) {
  if (!(await projectSeoChallengeEnabled())) return null;
  const [row, state] = await Promise.all([
    prisma.projectSeoChallenge.findUnique({
      where: { userId_projectId: { userId, projectId } },
      select: { id: true, joinedOn: true, timeZone: true },
    }),
    prisma.achievementState.findUnique({ where: { userId }, select: { enabled: true } }),
  ]);
  return row && state?.enabled !== false ? row : null;
}

async function insertCheckIn(challengeId: string, localDay: string, source: string) {
  // The (challengeId, localDay) key makes repeats, retries and races a no-op.
  const created = await prisma.projectSeoChallengeCheckIn.createMany({
    data: [{ challengeId, localDay, source }],
    skipDuplicates: true,
  });
  return created.count > 0 ? ("recorded" as const) : ("existing" as const);
}

/** Entering the project checks in the member's local day once, inside the window only. */
export async function recordProjectChallengeVisit(
  userId: string,
  projectId: string,
  at = new Date(),
): Promise<ChallengeCheckInResult> {
  const row = await enrollment(userId, projectId);
  if (!row) return "skipped";
  const day = calendarDay(at, row.timeZone);
  if (!insideChallengeWindow(day, row.joinedOn)) return "skipped";
  return insertCheckIn(row.id, day, "visit");
}

/**
 * Marks a past or current window day the member worked without visiting.
 * Allowed after the window ends to correct a missed day; never for future days.
 */
export async function markProjectChallengeDay(
  userId: string,
  projectId: string,
  day: string,
  at = new Date(),
): Promise<ChallengeCheckInResult> {
  const row = await enrollment(userId, projectId);
  if (!row) return "skipped";
  if (!canMarkChallengeDay(day, row.joinedOn, calendarDay(at, row.timeZone))) return "invalid";
  return insertCheckIn(row.id, day, "manual");
}

/**
 * The enrollment time zone while a visit can still check in a day, else null.
 * The project layout mounts the visit hook only when this is set, so the
 * browser keys its once-a-day calls to the enrollment day, not its own.
 */
export async function readChallengeVisitTimeZone(userId: string, projectId: string) {
  const row = await enrollment(userId, projectId);
  if (!row) return null;
  return calendarDay(new Date(), row.timeZone) <= challengeWindow(row.joinedOn).end
    ? row.timeZone
    : null;
}
