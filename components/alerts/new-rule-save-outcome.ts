import { newRuleFormDefaults } from "@/components/alerts/new-rule-form-defaults";
import type { NewRuleForm } from "@/lib/alerts/new-rule-data";
import {
  type AlertConditionTypeInput,
  type AlertTargetTypeInput,
  alertConditionTypes,
  alertTargetTypes,
} from "@/lib/alerts/schema";

export type RuleSaveOutcome =
  | { kind: "close" }
  | { kind: "error"; message: string }
  | {
      kind: "stay";
      persisted: NewRuleForm | null;
      ruleId: string | null;
      warning: string;
    };

function isCondition(value: unknown): value is AlertConditionTypeInput {
  return alertConditionTypes.some((condition) => condition === value);
}

function isTarget(value: unknown): value is AlertTargetTypeInput {
  return alertTargetTypes.some((target) => target === value);
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function persistedPreview(projectId: string, value: unknown) {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Record<string, unknown>;
  const base = newRuleFormDefaults(projectId, "slipped");
  return {
    ...base,
    changePct: finiteNumber(snapshot.changePct, base.changePct ?? 0),
    competitorDomain:
      typeof snapshot.competitorDomain === "string"
        ? snapshot.competitorDomain
        : base.competitorDomain,
    conditionType: isCondition(snapshot.conditionType)
      ? snapshot.conditionType
      : base.conditionType,
    dropPositions: finiteNumber(snapshot.dropPositions, base.dropPositions ?? 0),
    marketIds: Array.isArray(snapshot.marketIds)
      ? snapshot.marketIds.filter((id): id is string => typeof id === "string")
      : base.marketIds,
    name: typeof snapshot.name === "string" ? snapshot.name : base.name,
    ruleId: undefined,
    serpFeature: typeof snapshot.serpFeature === "string" ? snapshot.serpFeature : base.serpFeature,
    targetIds: Array.isArray(snapshot.targetIds)
      ? snapshot.targetIds.filter((id): id is string => typeof id === "string")
      : base.targetIds,
    targetType: isTarget(snapshot.targetType) ? snapshot.targetType : base.targetType,
    thresholdPosition: finiteNumber(snapshot.thresholdPosition, base.thresholdPosition ?? 0),
    topN: finiteNumber(snapshot.topN, base.topN ?? 0),
  } satisfies NewRuleForm;
}

export function readRuleSaveOutcome(
  result: unknown,
  projectId: string,
  alreadyCreated: string,
): RuleSaveOutcome {
  const saved = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
  if (saved.ok === false && typeof saved.error === "string") {
    return { kind: "error", message: saved.error };
  }
  const ruleId = typeof saved.id === "string" ? saved.id : null;
  const depthWarning = typeof saved.warning === "string" ? saved.warning : null;
  if (saved.replayed === true) {
    return {
      kind: "stay",
      persisted: persistedPreview(projectId, saved.persisted),
      ruleId,
      warning: [alreadyCreated, depthWarning].filter(Boolean).join(" "),
    };
  }
  if (depthWarning) {
    return { kind: "stay", persisted: null, ruleId, warning: depthWarning };
  }
  return { kind: "close" };
}
