import { alertRuleToolProperties } from "@/lib/alerts/tool-schema";
import { closedEnum, publicIdUnion, sdkName } from "./openapi-sdk-schema";

const properties = {
  ...alertRuleToolProperties,
  channels: {
    ...alertRuleToolProperties.channels,
    default: [],
    items: { ...alertRuleToolProperties.channels.items, ...closedEnum("AlertChannelInput") },
  },
  condition_type: {
    ...alertRuleToolProperties.condition_type,
    ...closedEnum("AlertConditionTypeInput"),
  },
  severity: { ...alertRuleToolProperties.severity, ...closedEnum("AlertSeverityInput") },
  enabled: { ...alertRuleToolProperties.enabled, default: true },
  target_type: {
    ...alertRuleToolProperties.target_type,
    default: "all",
    ...closedEnum("AlertTargetTypeInput"),
  },
  market_ids: {
    ...alertRuleToolProperties.market_ids,
    items: { ...alertRuleToolProperties.market_ids.items, minLength: 1, maxLength: 120 },
  },
  recipient_ids: {
    ...alertRuleToolProperties.recipient_ids,
    items: { ...alertRuleToolProperties.recipient_ids.items, minLength: 1, maxLength: 120 },
  },
  target_ids: {
    ...alertRuleToolProperties.target_ids,
    default: [],
    items: {
      oneOf: alertRuleToolProperties.target_ids.items.oneOf.map((id) => ({
        ...id,
        minLength: 1,
        maxLength: 120,
      })),
      ...publicIdUnion(["keyword", "tag"]),
      ...sdkName("AlertRuleTargetIdInput"),
    },
  },
};
const input = {
  properties,
  required: ["name", "condition_type"],
  type: "object",
  description:
    "name and condition_type are required for create and PATCH. Condition-specific fields must be supplied: threshold_position for threshold, change_pct for change_pct/ctr_drop (at most 100 for ctr_drop), drop_positions for position_drop, top_n for enters_top_n/exits_top_n, competitor_domain for competitor_overtake, serp_feature for serp_feature. Non-all targets require target_ids. Nullable condition fields accept null independently of omission.",
};
export const alertRuleSchemas = {
  AlertRuleInput: {
    ...input,
    properties: {
      ...properties,
      rule_id: {
        type: "string",
        minLength: 1,
        maxLength: 120,
        description: "Compatibility form field; ignored on create.",
      },
    },
  },
  AlertRulePatch: {
    ...input,
    description: `${input.description} Omitted market_ids and recipient_ids preserve scope and recipients; empty arrays clear them. Other defaulted fields retain the form defaults (enabled true, channels/target_ids empty, target_type all).`,
  },
  AlertRuleDeleteResult: {
    type: "object",
    properties: { deleted: { type: "boolean" } },
    required: ["deleted"],
  },
};
