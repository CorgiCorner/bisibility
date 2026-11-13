import type { ChallengeReportBody } from "./schema";

type Journey = NonNullable<ChallengeReportBody["journey"]>;

/**
 * Reports saved before check-ins count verified work days. Newer challenge
 * reports carry `checkIns` and say how many window days were checked in.
 */
export function journeyFrameMessage(journey: Journey) {
  return journey.checkIns === undefined
    ? ({
        key: "journeyFrame",
        values: { calendarDays: journey.calendarDays, workDays: journey.workDays },
      } as const)
    : ({
        key: "journeyFrameCheckIns",
        values: { calendarDays: journey.calendarDays, checkIns: journey.checkIns },
      } as const);
}
