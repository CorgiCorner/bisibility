import type { AlertRuleView } from "@/lib/alerts/alert-data";

export function makeAlertRule(overrides: Partial<AlertRuleView> = {}): AlertRuleView {
  return {
    changePct: null,
    channel: "In-app",
    channels: [],
    condition: "rank crosses below #10",
    conditionType: "threshold",
    competitorDomain: null,
    depthConflict: null,
    dropPositions: null,
    enabled: true,
    fires: "0 this week",
    id: "alr_abcdefghijklmnopqrstuvwx",
    marketIds: [],
    name: "Ranking drop",
    period: "Each check",
    recipientIds: [],
    scope: "All keywords",
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
  scope: "Selected keywords",
  targetIds: ["keyword_1"],
  targetType: "keyword",
});
