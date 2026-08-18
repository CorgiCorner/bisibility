import { ALERT_CHANNELS_OPENAPI_DESCRIPTION } from "./channel-availability";
import {
  ALERT_RULE_NAME_MIN_LENGTH,
  ALERT_RULE_PERCENT_MAX,
  ALERT_RULE_PERCENT_MIN,
  ALERT_RULE_RANK_MAX,
  ALERT_RULE_RANK_MIN,
  ALERT_RULE_TEXT_MAX_LENGTH,
  ALERT_RULE_TEXT_MIN_LENGTH,
  alertChannels,
  alertConditionTypes,
  alertTargetTypes,
} from "./schema";
import { alertSeverities } from "./severity";

const stringSchema = { type: "string" } as const;
const publicIdSchema = (prefix: string) =>
  ({
    pattern: `^${prefix}_[a-z][a-z0-9]{23}$`,
    type: "string",
  }) as const;
const nullableStringSchema = {
  maxLength: ALERT_RULE_TEXT_MAX_LENGTH,
  minLength: ALERT_RULE_TEXT_MIN_LENGTH,
  type: ["string", "null"],
} as const;
const nullableRankSchema = {
  maximum: ALERT_RULE_RANK_MAX,
  minimum: ALERT_RULE_RANK_MIN,
  type: ["integer", "null"],
} as const;

export const alertRuleToolProperties = {
  channels: {
    description: ALERT_CHANNELS_OPENAPI_DESCRIPTION,
    items: { enum: alertChannels, type: "string" },
    type: "array",
  },
  change_pct: {
    maximum: ALERT_RULE_PERCENT_MAX,
    minimum: ALERT_RULE_PERCENT_MIN,
    type: ["number", "null"],
  },
  competitor_domain: nullableStringSchema,
  condition_type: { enum: alertConditionTypes, type: "string" },
  drop_positions: nullableRankSchema,
  enabled: { type: "boolean" },
  name: {
    maxLength: ALERT_RULE_TEXT_MAX_LENGTH,
    minLength: ALERT_RULE_NAME_MIN_LENGTH,
    type: "string",
  },
  market_ids: { items: publicIdSchema("pmkt"), type: "array" },
  recipient_ids: { items: publicIdSchema("usr"), type: "array" },
  serp_feature: nullableStringSchema,
  severity: { enum: alertSeverities, type: "string" },
  target_ids: {
    items: { oneOf: [publicIdSchema("kw"), publicIdSchema("tag")] },
    type: "array",
  },
  target_type: { enum: alertTargetTypes, type: "string" },
  threshold_position: nullableRankSchema,
  top_n: nullableRankSchema,
} as const;

export function alertRuleToolSchema({
  includeApiKey = false,
  update = false,
}: {
  includeApiKey?: boolean;
  update?: boolean;
} = {}) {
  return {
    properties: {
      ...(includeApiKey ? { api_key: stringSchema } : {}),
      idempotency_key: stringSchema,
      project_id: publicIdSchema("prj"),
      ...(update ? { rule_id: publicIdSchema("alr") } : {}),
      ...alertRuleToolProperties,
    },
    required: [
      ...(includeApiKey ? ["api_key"] : []),
      "project_id",
      ...(update ? ["rule_id"] : []),
      "name",
      "condition_type",
    ],
    type: "object",
  };
}
