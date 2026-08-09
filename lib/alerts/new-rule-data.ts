import type { AlertRuleForm } from "@/lib/alerts/schema";
import { alertRuleFormBaseSchema, refineAlertRuleForm } from "@/lib/alerts/schema";
import { type AlertSeverity, alertSeverities } from "@/lib/alerts/severity";
import { z } from "zod";

export const ruleTemplateIds = [
  "positiondrop",
  "slipped",
  "top3",
  "wrongurl",
  "downtrend",
  "competitor",
  "ctr",
] as const;

export type RuleTemplateId = (typeof ruleTemplateIds)[number];
export type RuleSeverity = AlertSeverity;

type RuleDefaults = Pick<
  AlertRuleForm,
  | "changePct"
  | "competitorDomain"
  | "conditionType"
  | "dropPositions"
  | "serpFeature"
  | "targetIds"
  | "targetType"
  | "thresholdPosition"
  | "topN"
>;

export type RuleTemplate = {
  conditions: string[];
  defaults: RuleDefaults;
  disabled?: boolean;
  evalMode: string;
  label: string;
  name: string;
  preview: string;
  requirement?: string;
  scope: string;
  severity: RuleSeverity;
};

const allTargets = { targetIds: [] as string[], targetType: "all" as const };
const emptyCondition = {
  changePct: null,
  competitorDomain: null,
  dropPositions: null,
  serpFeature: null,
  thresholdPosition: null,
  topN: null,
};

export const ruleSeverityMeta = {
  info: {
    background: "color-mix(in srgb, var(--blue) 12%, transparent)",
    color: "var(--blue)",
    label: "Info",
  },
  urgent: {
    background: "color-mix(in srgb, var(--red) 12%, transparent)",
    color: "var(--red)",
    label: "Urgent",
  },
  warning: {
    background: "color-mix(in srgb, var(--yellow) 14%, transparent)",
    color: "var(--yellow-text)",
    label: "Warning",
  },
} satisfies Record<RuleSeverity, { background: string; color: string; label: string }>;

export const ruleTemplates = {
  positiondrop: {
    conditions: ["Previous and current ranks are numeric", "Position worsens by at least 5"],
    defaults: {
      ...allTargets,
      ...emptyCondition,
      conditionType: "position_drop",
      dropPositions: 5,
    },
    disabled: false,
    evalMode: "Each completed check",
    label: "Dropped more than N positions",
    name: "Dropped more than 5 positions",
    preview: "Notify me when any keyword drops by 5 or more positions between completed checks.",
    scope: "All keywords",
    severity: "warning",
  },
  slipped: {
    conditions: ["Previous rank was #1-10", "Current rank is #11+"],
    defaults: { ...allTargets, ...emptyCondition, conditionType: "exits_top_n", topN: 10 },
    disabled: false,
    evalMode: "Each completed check",
    label: "Slipped from top 10",
    name: "Slipped out of top 10",
    preview: "Notify me when any keyword drops from positions 1-10 to 11+ on Google US Desktop.",
    scope: "All keywords",
    severity: "urgent",
  },
  top3: {
    conditions: ["Previous rank was #4+", "Current rank is #1-3"],
    defaults: { ...allTargets, ...emptyCondition, conditionType: "enters_top_n", topN: 3 },
    disabled: false,
    evalMode: "Each completed check",
    label: "Entered top 3",
    name: "Jumped into top 3",
    preview: "Notify me when any keyword moves up into the top 3 on Google US Desktop.",
    scope: "All keywords",
    severity: "info",
  },
  wrongurl: {
    conditions: ["Keyword target URL is set", "Ranking URL differs from target URL"],
    defaults: {
      ...allTargets,
      ...emptyCondition,
      conditionType: "url_mismatch",
    },
    disabled: false,
    evalMode: "Each completed check",
    label: "Wrong URL ranking",
    name: "Wrong URL ranking",
    preview: "Notify me when Google ranks a URL that differs from the keyword's target URL.",
    scope: "Keywords with target URL set",
    severity: "urgent",
  },
  downtrend: {
    conditions: ["At least 3 of 4 recent steps decline", "Newest rank is worse than oldest"],
    defaults: { ...allTargets, ...emptyCondition, conditionType: "downtrend" },
    disabled: false,
    evalMode: "Trend / starts after 5 checks",
    label: "Sustained downtrend",
    name: "Sustained downtrend",
    preview: "Notify me when a keyword moves down in 3 of the last 5 completed checks.",
    scope: "All keywords",
    severity: "warning",
  },
  competitor: {
    conditions: ["A competitor ranks above your project domain"],
    defaults: {
      ...allTargets,
      ...emptyCondition,
      competitorDomain: "",
      conditionType: "competitor_overtake",
    },
    disabled: false,
    evalMode: "Each completed check",
    label: "Competitor overtook",
    name: "Competitor overtook us",
    preview: "Notify me when a competitor ranks above your project domain for a tracked keyword.",
    scope: "All keywords",
    severity: "warning",
  },
  ctr: {
    conditions: [
      "Rank stays stable",
      "Stored 7-day CTR drops vs the prior 28 days",
      "Requires traffic sync and a connected GSC account",
    ],
    defaults: {
      ...allTargets,
      ...emptyCondition,
      changePct: 20,
      conditionType: "ctr_drop",
    },
    disabled: false,
    evalMode: "Stored 7 days vs prior 28 days (~3-day lag)",
    label: "CTR drop (GSC)",
    name: "CTR drop",
    preview:
      "Notify me when stored CTR drops by 20% or more versus the prior 28 days while average rank stays within one position. Search Console data has an approximately 3-day lag and requires traffic sync plus a connected GSC account.",
    requirement: "Requires GSC",
    scope: "All keywords",
    severity: "warning",
  },
} satisfies Record<RuleTemplateId, RuleTemplate>;

export function ruleTemplatesForDomain(projectDomain?: string | null) {
  const domain = projectDomain?.trim() || "your project domain";

  return {
    ...ruleTemplates,
    competitor: {
      ...ruleTemplates.competitor,
      conditions: [`A competitor ranks above ${domain}`],
      preview: `Notify me when a competitor ranks above ${domain} for a tracked keyword.`,
    },
  } satisfies Record<RuleTemplateId, RuleTemplate>;
}

export const newRuleSchema = z
  .object({
    ...alertRuleFormBaseSchema.shape,
    severity: z.enum(alertSeverities),
    template: z.enum(ruleTemplateIds),
  })
  .superRefine(refineAlertRuleForm);

export type NewRuleForm = z.infer<typeof newRuleSchema>;

export function isRuleTemplateId(value: string): value is RuleTemplateId {
  return ruleTemplateIds.includes(value as RuleTemplateId);
}
