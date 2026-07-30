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
