import { resolveCurrentRankTrackerTargets } from "@/lib/queries/rank-tracker-report-resolve";
import type { RankReportPolicy, RankReportTarget } from "@/lib/rank-reports/model";
import { summarizeRankReport } from "@/lib/rank-reports/summary";

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
  return { report, movers, checkedKeywords: report.metric.counts.measured,
    avgPositionDelta: movers.length ? movers.reduce((sum, mover) => sum + mover.delta, 0) / movers.length : null };
}
