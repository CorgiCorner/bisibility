import type { RunCounts } from "./contract";

export type RunItemGroup = {
  _count: { _all: number };
  _sum: { actualCostCents: number | null };
  keywordId: string;
  status: string;
};

function sumStatus(groups: RunItemGroup[], statuses: string[]) {
  return groups
    .filter((group) => statuses.includes(group.status))
    .reduce((sum, group) => sum + group._count._all, 0);
}

export function runCountsFromItemGroups(groups: RunItemGroup[], requested: number): RunCounts {
  return {
    cancelled: sumStatus(groups, ["cancelled"]),
    completed: sumStatus(groups, ["completed"]),
    deferred: sumStatus(groups, ["deferred"]),
    failed: sumStatus(groups, ["failed"]),
    requested,
    skipped: sumStatus(groups, ["skipped", "blocked"]),
    total: groups.reduce((sum, group) => sum + group._count._all, 0),
  };
}

export function pendingRunItemCount(groups: RunItemGroup[]) {
  return sumStatus(groups, ["queued", "running"]);
}

export function runCounterData(counts: RunCounts, groups: RunItemGroup[]) {
  return {
    cancelledCount: counts.cancelled,
    completedCount: counts.completed,
    deferredCount: counts.deferred,
    failedCount: counts.failed,
    keywordCount: new Set(groups.map((group) => group.keywordId)).size,
    skippedCount: counts.skipped,
    targetCount: counts.total,
    totalCount: counts.total,
  };
}
