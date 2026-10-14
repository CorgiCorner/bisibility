import type { RecordedMeasurementCheck } from "@/lib/rank-measurements/recorded-check";
import type { RankCheckStatus } from "./contract";
import { positionComparisonKey } from "./position-observations";

export type { RankCheckStatus } from "./contract";

export const RANK_CHECK_STATUS = {
  COMPLETED: "completed",
  DEFERRED: "deferred",
  FAILED: "failed",
  RUNNING: "running",
} as const satisfies Record<string, RankCheckStatus>;

export const RANK_CHECK_STATUS_LABEL = {
  completed: "Completed",
  deferred: "Skipped",
  failed: "Failed",
  running: "Running",
} as const satisfies Record<RankCheckStatus, string>;

export function checkStatusLabel(status: RankCheckStatus) {
  return RANK_CHECK_STATUS_LABEL[status];
}

export function whereExecutedChecks() {
  return { status: { not: RANK_CHECK_STATUS.DEFERRED } } as const;
}

export function whereCompletedChecks() {
  return { status: RANK_CHECK_STATUS.COMPLETED } as const;
}

type ComparableRankCheck = {
  normalizationVersion: string | null;
  requestedDepth: number | null;
};

type CompletedComparableRankCheck = ComparableRankCheck & {
  status?: string;
  position?: number | null;
  observationRun?: RecordedMeasurementCheck["observationRun"];
  provider?: string | null;
  checkedAt?: Date;
};

// Central policy boundary: missing historical depth stays unknown. Do not infer
// provider defaults here, because that would create assumed comparability.
export function effectiveRequestedDepth(check: Pick<ComparableRankCheck, "requestedDepth">) {
  return check.requestedDepth;
}

export function whereComparableTo(check: ComparableRankCheck) {
  const requestedDepth = effectiveRequestedDepth(check);
  if (!check.normalizationVersion || requestedDepth === null) return null;
  return {
    ...whereCompletedChecks(),
    normalizationVersion: check.normalizationVersion,
    requestedDepth,
  } as const;
}

export function comparableCompletedWindow<T extends CompletedComparableRankCheck>(
  checksNewestFirst: readonly T[],
) {
  const completed = checksNewestFirst.filter(
    (check) => check.status === undefined || check.status === RANK_CHECK_STATUS.COMPLETED,
  );
  const latest = completed[0];
  const key = latest
    ? positionComparisonKey({ ...latest, position: latest.position ?? null })
    : null;
  if (!key)
    return {
      boundary: latest ?? (null as T | null),
      checks: [] as T[],
      hasBoundary: latest !== undefined,
    };

  const checks: T[] = [];
  let boundary: T | null = null;
  for (const check of completed) {
    if (positionComparisonKey({ ...check, position: check.position ?? null }) === key) {
      checks.push(check);
      continue;
    }
    boundary = check;
    break;
  }
  return { boundary, checks, hasBoundary: boundary !== null };
}
