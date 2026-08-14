import type { AlertRuleView } from "@/lib/alerts/alert-data";
import { type NewRuleForm, type RuleTemplateId, ruleTemplates } from "@/lib/alerts/new-rule-data";

export function newRuleFormDefaults(
  projectId: string,
  templateId: RuleTemplateId,
  rule?: AlertRuleView,
  availableMarketIds?: readonly string[],
): NewRuleForm {
  const template = ruleTemplates[templateId];
  const availableMarkets = availableMarketIds ? new Set(availableMarketIds) : null;

  return {
    channels: rule?.channels ?? [],
    changePct: rule?.changePct ?? template.defaults.changePct,
    competitorDomain: rule?.competitorDomain ?? template.defaults.competitorDomain,
    conditionType: rule?.conditionType ?? template.defaults.conditionType,
    dropPositions: rule?.dropPositions ?? template.defaults.dropPositions,
    enabled: rule?.enabled ?? true,
    marketIds: (rule?.marketIds ?? []).filter((id) => availableMarkets?.has(id) ?? true),
    name: rule?.name ?? template.name,
    projectId,
    recipientIds: rule?.recipientIds ?? [],
    ruleId: rule?.id,
    serpFeature: rule?.serpFeature ?? template.defaults.serpFeature,
    severity: rule?.severity ?? template.severity,
    targetIds: [...(rule?.targetIds ?? template.defaults.targetIds)],
    targetType: rule?.targetType ?? template.defaults.targetType,
    template: templateId,
    thresholdPosition: rule?.thresholdPosition ?? template.defaults.thresholdPosition,
    topN: rule?.topN ?? template.defaults.topN,
  };
}
