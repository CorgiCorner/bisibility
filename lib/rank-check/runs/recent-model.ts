export const RECENT_RUN_WINDOW_MS = 15 * 60_000;
export const RECENT_RUN_LIMIT = 20;

export function recentRunExpiresAt(finishedAt: Date) {
  return new Date(finishedAt.getTime() + RECENT_RUN_WINDOW_MS);
}

export type RecentRunSummary = {
  up: number;
  down: number;
  underReview: number;
  incidentHref: string | null;
};

import type { EvidenceProjection } from "@/lib/provider-evidence/projection/model";
import { isRestoredCheck } from "@/lib/rank-check/restored-check";

type RecentCheck = {
  publicId: string;
  recoveryRestoredAt: Date | null;
  status: string;
  comparisonAllowed: boolean | null;
  position: number | null;
  previousPosition: number | null;
};
export function recentCheckCounts(
  source: readonly RecentCheck[],
  evidence: ReadonlyMap<string, EvidenceProjection | null>,
) {
  const checks = source.filter((check) => !isRestoredCheck(check));
  const result = (check: RecentCheck) => evidence.get(check.publicId)?.result;
  const comparable = checks.filter(
    (check) =>
      check.status === "completed" &&
      check.comparisonAllowed !== false &&
      !result(check) &&
      check.position !== null &&
      check.previousPosition !== null,
  );
  return {
    completed: checks.filter((check) => check.status === "completed").length,
    failed: checks.filter((check) => check.status === "failed" && result(check) !== "under_review")
      .length,
    deferred: checks.filter(
      (check) => check.status === "deferred" && result(check) !== "under_review",
    ).length,
    underReview: checks.filter((check) => result(check) === "under_review").length,
    up: comparable.filter(
      (check) =>
        check.position !== null &&
        check.previousPosition !== null &&
        check.position < check.previousPosition,
    ).length,
    down: comparable.filter(
      (check) =>
        check.position !== null &&
        check.previousPosition !== null &&
        check.position > check.previousPosition,
    ).length,
  };
}
