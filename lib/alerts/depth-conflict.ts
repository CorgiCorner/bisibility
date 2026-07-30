import { DEFAULT_SERP_DEPTH } from "@/lib/serp/markets";

export const DEPTH_CONFLICT_SIGNAL_TYPE = "depth_conflict";

type PositionRule = {
  conditionType: string;
  thresholdPosition?: number | null;
  topN?: number | null;
};

export type AlertDepthConflict = {
  threshold: number;
  trackedDepth: number;
};

export type TargetedDepthKeyword = {
  id: string;
  projectDepth?: number | null;
  scheduleDepth?: number | null;
  tagIds?: readonly string[];
};

export function alertPositionThreshold(rule: PositionRule) {
  if (rule.conditionType === "threshold") {
    return rule.thresholdPosition ?? null;
  }
  if (rule.conditionType === "enters_top_n" || rule.conditionType === "exits_top_n") {
    return rule.topN ?? null;
  }
  return null;
}

export function alertDepthConflict(
  rule: PositionRule,
  trackedDepth: number | null | undefined,
): AlertDepthConflict | null {
  const threshold = alertPositionThreshold(rule);
  const resolvedDepth = trackedDepth ?? DEFAULT_SERP_DEPTH;
  return threshold !== null && resolvedDepth < threshold
    ? { threshold, trackedDepth: resolvedDepth }
    : null;
}

export function effectiveKeywordDepth(keyword: TargetedDepthKeyword) {
  return keyword.scheduleDepth ?? keyword.projectDepth ?? DEFAULT_SERP_DEPTH;
}

export function minimumTargetedDepth(
  rule: { targetIds: readonly string[]; targetType: string },
  keywords: readonly TargetedDepthKeyword[],
) {
  const ids = new Set(rule.targetIds);
  const targeted = keywords.filter((keyword) => {
    if (rule.targetType === "all") return true;
    if (rule.targetType === "keyword") return ids.has(keyword.id);
    if (rule.targetType === "tag") {
      return (keyword.tagIds ?? []).some((tagId) => ids.has(tagId));
    }
    return false;
  });
  if (targeted.length === 0) return null;
  return Math.min(...targeted.map(effectiveKeywordDepth));
}

export function alertDepthConflictWarning(conflict: AlertDepthConflict | null) {
  if (!conflict) return null;
  return `This rule uses top ${conflict.threshold}, but some targets are tracked only to top ${conflict.trackedDepth}; it won't fire for deeper positions on those keywords.`;
}
