import { resolveCurrentRankTrackerTargets } from "@/lib/queries/rank-tracker-report-resolve";
import type { RankReportPolicy, RankReportTarget } from "@/lib/rank-reports/model";
import { summarizeRankReport } from "@/lib/rank-reports/summary";

function checkedKeywordCount(targets: readonly RankReportTarget[], policy: RankReportPolicy) {
  return targets.filter((target) =>
    target.checks.some((check) => {
      if (check.status !== "completed") return false;
      if (policy.currentNotBefore && check.checkedAt < policy.currentNotBefore) return false;
      return check.checkedAt <= policy.asOf;
    }),
  ).length;
}

/** Full selected membership, bounded captured baseline, and current authority use the list's resolver. */
export function weeklyDigestQuality(targets: readonly RankReportTarget[], policy: RankReportPolicy, projectId: string,
  labels: ReadonlyMap<string, string>) {
  const resolved = resolveCurrentRankTrackerTargets(targets, policy, projectId);
  const report = summarizeRankReport(resolved, policy);
  const movers = resolved.flatMap(({ id, resolution }) => {
    if (resolution.movement === null) return [];
    return [{ publicId: id, keyword: labels.get(id) ?? "", delta: resolution.movement,
      from: resolution.baseline?.position ?? null, to: resolution.current?.position ?? null }];
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.delta - a.delta || a.keyword.localeCompare(b.keyword));
  return { report, movers, checkedKeywords: checkedKeywordCount(targets, policy),
    avgPositionDelta: movers.length ? movers.reduce((sum, mover) => sum + mover.delta, 0) / movers.length : null };
}
