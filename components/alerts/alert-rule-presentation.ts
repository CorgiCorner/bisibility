import type { AlertRuleView } from "@/lib/alerts/alert-data";
import type { useTranslations } from "next-intl";

type Translate = ReturnType<typeof useTranslations<"projectAlerts.rules">>;

function numberOrZero(value: number | null) {
  return value ?? 0;
}

export function presentAlertRule(rule: AlertRuleView, t: Translate) {
  const condition = (() => {
    switch (rule.conditionType) {
      case "change_pct":
        return t("conditionChangePct", { percent: numberOrZero(rule.changePct) });
      case "competitor_overtake":
        return t("conditionCompetitor", { domain: rule.competitorDomain ?? t("unknownValue") });
      case "ctr_drop":
        return t("conditionCtrDrop", { percent: numberOrZero(rule.changePct) });
      case "downtrend":
        return t("conditionDowntrend");
      case "enters_top_n":
        return t("conditionEntersTopN", { position: numberOrZero(rule.topN) });
      case "exits_top_n":
        return t("conditionExitsTopN", { position: numberOrZero(rule.topN) });
      case "position_drop":
        return t("conditionPositionDrop", { positions: numberOrZero(rule.dropPositions) });
      case "serp_feature":
        return t("conditionSerpFeature", { feature: rule.serpFeature ?? t("unknownValue") });
      case "threshold":
        return t("conditionThreshold", { position: numberOrZero(rule.thresholdPosition) });
      case "url_mismatch":
        return t("conditionUrlMismatch");
    }
  })();
  const scope =
    rule.targetType === "all"
      ? t("scopeAll")
      : rule.scope.labels.length === 0
        ? rule.targetType === "keyword"
          ? t("scopeSelectedKeywords")
          : t("scopeSelectedTags")
        : rule.scope.labels.length === 1
          ? rule.scope.labels[0]
          : t("scopeMany", { count: rule.scope.labels.length - 1, name: rule.scope.labels[0] });
  const marketScope = rule.marketScope?.label
    ? rule.marketScope.label
    : rule.marketScope?.count
      ? t("marketCount", { count: rule.marketScope.count })
      : t("allMarkets");

  return {
    condition,
    fires: t("firesThisWeek", { count: rule.firedThisWeek }),
    marketScope,
    period: rule.period === "ctr_baseline" ? t("periodCtrBaseline") : t("periodEachCheck"),
    scope,
  };
}
