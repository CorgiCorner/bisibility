import type { ChallengeReportBody } from "@/lib/challenge-report/schema";

export function reportSeriesKey(body: Pick<ChallengeReportBody, "period" | "journey">) {
  const frame = body.journey ? "journey" : "performance";
  return `${frame}:${body.period.from}`;
}

export function stageRank(stage: ChallengeReportBody["stage"], days: number): number {
  if (stage === "day30") return 30;
  if (stage === "day60") return 60;
  if (stage === "day90") return 90;
  return days;
}

export type StageCandidate = {
  createdAt: string;
  from: string;
  id: string;
  onActiveLink: boolean;
  rank: number;
  stage: ChallengeReportBody["stage"];
  title: string;
};

export function pickPendingUpdate(
  current: { from: string; rank: number },
  candidates: readonly StageCandidate[],
): StageCandidate | null {
  return (
    candidates
      .filter(
        (item) => !item.onActiveLink && item.from === current.from && item.rank > current.rank,
      )
      .sort(
        (left, right) => right.rank - left.rank || right.createdAt.localeCompare(left.createdAt),
      )[0] ?? null
  );
}

export function isLaterStage(
  candidate: Pick<ChallengeReportBody, "period" | "stage" | "journey">,
  current: Pick<ChallengeReportBody, "period" | "stage" | "journey">,
): boolean {
  return (
    reportSeriesKey(candidate) === reportSeriesKey(current) &&
    stageRank(candidate.stage, candidate.period.days) >
      stageRank(current.stage, current.period.days)
  );
}
