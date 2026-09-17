import type { AlertRuleView } from "@/lib/alerts/alert-data";

export function makeAlertRule(overrides: Partial<AlertRuleView> = {}): AlertRuleView {
  return {
    changePct: null,
    channels: [],
    conditionType: "threshold",
    competitorDomain: null,
    depthConflict: null,
    dropPositions: null,
    enabled: true,
    firedThisWeek: 0,
    id: "alr_abcdefghijklmnopqrstuvwx",
    marketIds: [],
    name: "Ranking drop",
    period: "each_check",
    recipientIds: [],
    scope: { labels: [], targetType: "all" },
    serpFeature: null,
    severity: "urgent",
    status: "active",
    targetIds: [],
    targetType: "all",
    thresholdPosition: 10,
    topN: null,
    ...overrides,
  };
}

export const keywordScopedAlertRule: AlertRuleView = makeAlertRule({
  depthConflict: { threshold: 50, trackedDepth: 10 },
  scope: { labels: [], targetType: "keyword" },
  targetIds: ["keyword_1"],
  targetType: "keyword",
});
