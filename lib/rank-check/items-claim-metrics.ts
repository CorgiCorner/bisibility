import type { ClaimedRankCheckGroup } from "./dispatcher-types";

export function itemClaimMetrics(
  groups: ClaimedRankCheckGroup[],
  claimed: number,
  now: Date,
  candidates: { dueAt: Date }[],
) {
  const perProject = new Map<string, number>();
  for (const group of groups) {
    perProject.set(
      group.projectId,
      (perProject.get(group.projectId) ?? 0) + group.keywordIds.length,
    );
  }
  const oldest = candidates.reduce<Date | null>(
    (value, item) => (!value || item.dueAt < value ? item.dueAt : value),
    null,
  );
  return {
    distinctProjects: perProject.size,
    largestProjectClaim: Math.max(0, ...perProject.values()),
    oldestDueLagMsAfter: null,
    oldestDueLagMsBefore: oldest ? Math.max(0, now.getTime() - oldest.getTime()) : null,
    outcome: claimed > 0 ? ("claimed" as const) : ("empty_or_skipped_locked" as const),
  };
}
