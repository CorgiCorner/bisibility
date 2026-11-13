import "server-only";

import { CHALLENGE_WINDOW_DAYS } from "./challenge-window";
import { readProjectChallenge } from "./project-challenge";

/**
 * The challenge report covers exactly the 30-day window and is available once
 * it has ended, however many days were checked in. `workDays` stays verified
 * work days, as in reports saved before check-ins; `checkIns` is separate.
 */
export async function reportJourney(userId: string, projectId: string) {
  const challenge = await readProjectChallenge(userId, projectId);
  if (!challenge?.progress.ended) return null;
  return {
    from: challenge.progress.start,
    to: challenge.progress.end,
    snapshotId: challenge.snapshotId,
    journey: {
      workDays: challenge.workDays,
      calendarDays: CHALLENGE_WINDOW_DAYS,
      checkIns: challenge.progress.checkInCount,
    },
  };
}
