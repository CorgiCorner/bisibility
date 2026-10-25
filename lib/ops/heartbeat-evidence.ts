import type { EvidenceProjection, ProjectionKey } from "@/lib/provider-evidence/projection/model";
import { projectionCounts } from "@/lib/provider-evidence/projection/model";
export type HeartbeatEvidenceCounts = Record<ProjectionKey, number>;
export function heartbeatEvidenceCounts(values: Iterable<EvidenceProjection | null>) {
  return projectionCounts(values);
}
export function heartbeatDeferredText(rank: {
  deferred: number;
  deferredReasons?: Record<string, number>;
  evidenceCounts?: HeartbeatEvidenceCounts;
}) {
  const labels = {
    under_review: "under review",
    recovered: "recovered",
    partial: "partial",
    provider_error: "provider error",
    missing: "missing",
    cost_conflict: "cost conflict",
  } as const;
  const evidence = Object.entries(labels).flatMap(([key, label]) => {
    const count = rank.evidenceCounts?.[key as ProjectionKey] ?? 0;
    return count ? [`${count} ${label}`] : [];
  });
  const reasons = rank.deferredReasons ?? {};
  const known = (
    [
      ["budget_exhausted", "project budget"],
      ["rate_limited", "provider limit"],
      ["no_provider", "no provider"],
      ["migration_hold", "migration hold"],
    ] as const
  ).flatMap(([key, label]) => (reasons[key] ? [`${reasons[key]} ${label}`] : []));
  const classified = Object.values(reasons).reduce((sum, count) => sum + count, 0);
  if (!evidence.length && !known.length)
    return `Rank checks: ${rank.deferred} deferred - classification unavailable; inspect Checks.`;
  const other = Math.max(0, rank.deferred - classified);
  return `Rank checks: ${[...evidence, ...known, ...(other ? [`${other} other deferrals`] : [])].join(" · ")}.`;
}
