import type { RankCheckStatus } from "./contract";

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
  const predicate = latest ? whereComparableTo(latest) : null;
  if (!predicate) return { boundary: null as T | null, checks: [] as T[], hasBoundary: false };

  const checks: T[] = [];
  let boundary: T | null = null;
  for (const check of completed) {
    if (
      check.normalizationVersion === predicate.normalizationVersion &&
      check.requestedDepth === predicate.requestedDepth
    ) {
      checks.push(check);
      continue;
    }
    boundary = check;
    break;
  }
  return { boundary, checks, hasBoundary: boundary !== null };
}
