import { z } from "zod";
import { alertSeverities } from "./severity";

export const ALERT_RULE_CTR_DROP_PERCENT_MAX = 100;
export const ALERT_RULE_ID_MAX_LENGTH = 120;
export const ALERT_RULE_ID_MIN_LENGTH = 1;
export const ALERT_RULE_NAME_MIN_LENGTH = 2;
export const ALERT_RULE_PERCENT_MAX = 1000;
export const ALERT_RULE_PERCENT_MIN = 0.1;
export const ALERT_RULE_RANK_MAX = 100;
export const ALERT_RULE_RANK_MIN = 1;
export const ALERT_RULE_TEXT_MAX_LENGTH = 120;
export const ALERT_RULE_TEXT_MIN_LENGTH = 1;

export const idSchema = z
  .string()
  .trim()
  .min(ALERT_RULE_ID_MIN_LENGTH)
  .max(ALERT_RULE_ID_MAX_LENGTH);
export const emptyToNull = (value: unknown) => (value === "" ? null : value);
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const alertConditionTypes = [
  "threshold",
  "change_pct",
  "ctr_drop",
  "position_drop",
  "downtrend",
  "enters_top_n",
  "exits_top_n",
  "competitor_overtake",
  "serp_feature",
  "url_mismatch",
] as const;

export const alertChannels = ["email", "slack", "webhook"] as const;
export const alertTargetTypes = ["all", "keyword", "tag"] as const;

export type AlertConditionTypeInput = (typeof alertConditionTypes)[number];
export type AlertChannelInput = (typeof alertChannels)[number];
export type AlertTargetTypeInput = (typeof alertTargetTypes)[number];

const nullableRankNumber = z.preprocess(
  emptyToNull,
  z.coerce.number().int().min(ALERT_RULE_RANK_MIN).max(ALERT_RULE_RANK_MAX).nullable().optional(),
);

const nullablePercent = z.preprocess(
  emptyToNull,
  z.coerce.number().min(ALERT_RULE_PERCENT_MIN).max(ALERT_RULE_PERCENT_MAX).nullable().optional(),
);

const nullableText = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .min(ALERT_RULE_TEXT_MIN_LENGTH)
    .max(ALERT_RULE_TEXT_MAX_LENGTH)
    .nullable()
    .optional(),
);

export const alertRuleFormBaseSchema = z.object({
  channels: z.array(z.enum(alertChannels)).default([]),
  changePct: nullablePercent,
  competitorDomain: nullableText,
  conditionType: z.enum(alertConditionTypes),
  dropPositions: nullableRankNumber,
  enabled: z.coerce.boolean().default(true),
  name: z
    .string()
    .trim()
    .min(ALERT_RULE_NAME_MIN_LENGTH, "Name the rule.")
    .max(ALERT_RULE_TEXT_MAX_LENGTH),
  projectId: idSchema,
  // Omitted create input defaults to the actor; omitted update input preserves recipients.
  // An explicit empty array always means no recipients.
  recipientIds: z.array(idSchema).optional(),
  ruleId: z.preprocess(emptyToUndefined, idSchema.optional()),
  serpFeature: nullableText,
  severity: z.enum(alertSeverities).optional(),
  targetIds: z.array(idSchema).default([]),
  targetType: z.enum(alertTargetTypes).default("all"),
  thresholdPosition: nullableRankNumber,
  topN: nullableRankNumber,
});

export function refineAlertRuleForm(
  value: z.infer<typeof alertRuleFormBaseSchema>,
  ctx: z.RefinementCtx,
) {
  if (value.targetType !== "all" && value.targetIds.length === 0) {
    ctx.addIssue({
      code: "custom",
      message: "Choose at least one target.",
      path: ["targetIds"],
    });
  }

  if (value.conditionType === "threshold" && !value.thresholdPosition) {
    ctx.addIssue({
      code: "custom",
      message: "Choose a threshold position.",
      path: ["thresholdPosition"],
    });
  }

  if (
    (value.conditionType === "change_pct" || value.conditionType === "ctr_drop") &&
    !value.changePct
  ) {
    ctx.addIssue({
      code: "custom",
      message:
        value.conditionType === "ctr_drop"
          ? "Choose a CTR drop percentage."
          : "Choose a percent change.",
      path: ["changePct"],
    });
  }

  if (
    value.conditionType === "ctr_drop" &&
    value.changePct &&
    value.changePct > ALERT_RULE_CTR_DROP_PERCENT_MAX
  ) {
    ctx.addIssue({
      code: "custom",
      message: "CTR drop percentage cannot exceed 100.",
      path: ["changePct"],
    });
  }

  if (value.conditionType === "position_drop" && !value.dropPositions) {
    ctx.addIssue({
      code: "custom",
      message: "Choose a position drop.",
      path: ["dropPositions"],
    });
  }

  if (
    (value.conditionType === "enters_top_n" || value.conditionType === "exits_top_n") &&
    !value.topN
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Choose the top-N boundary.",
      path: ["topN"],
    });
  }

  if (value.conditionType === "competitor_overtake" && !value.competitorDomain) {
    ctx.addIssue({
      code: "custom",
      message: "Enter a competitor domain.",
      path: ["competitorDomain"],
    });
  }

  if (value.conditionType === "serp_feature" && !value.serpFeature) {
    ctx.addIssue({
      code: "custom",
      message: "Enter a SERP feature.",
      path: ["serpFeature"],
    });
  }
}

export const alertRuleFormSchema = alertRuleFormBaseSchema.superRefine(refineAlertRuleForm);

export const alertRuleToggleSchema = z.object({
  enabled: z.coerce.boolean(),
  projectId: idSchema,
  ruleId: idSchema,
});

export const alertRuleDeleteSchema = z.object({
  projectId: idSchema,
  ruleId: idSchema,
});

export const slackConnectionPlaceholderSchema = z.object({
  enabled: z.coerce.boolean().default(true),
  projectId: idSchema,
});

export type AlertRuleForm = z.infer<typeof alertRuleFormSchema>;
export type AlertRuleToggleInput = z.infer<typeof alertRuleToggleSchema>;
