import { alertRuleToolProperties } from "@/lib/alerts/tool-schema";
import { publicIdSchema } from "./openapi-public-id";
import { openEnum, publicIdUnion, sdkName, taggedUnion } from "./openapi-sdk-schema";

/** The shared alert rule properties, with the type names an SDK generator emits. */
const alertRuleProperties = {
  ...alertRuleToolProperties,
  channels: {
    ...alertRuleToolProperties.channels,
    items: { ...alertRuleToolProperties.channels.items, ...openEnum("AlertChannel") },
  },
  condition_type: { ...alertRuleToolProperties.condition_type, ...openEnum("AlertConditionType") },
  severity: { ...alertRuleToolProperties.severity, ...openEnum("AlertSeverity") },
  target_ids: {
    ...alertRuleToolProperties.target_ids,
    items: {
      ...alertRuleToolProperties.target_ids.items,
      ...publicIdUnion(["keyword", "tag"]),
      ...sdkName("AlertRuleTargetId"),
    },
  },
  target_type: { ...alertRuleToolProperties.target_type, ...openEnum("AlertTargetType") },
};

/** One alert rule as stored, before its targets are narrowed by `target_type`. */
const alertRuleBase = {
  properties: {
    ...alertRuleProperties,
    channel: { description: "Display label for the delivery channels.", type: "string" },
    condition: { description: "Display sentence for the rule condition.", type: "string" },
    fires: { description: "Display count of triggers in the last seven days.", type: "string" },
    id: publicIdSchema("alr"),
    market_scope: { description: "Display label for the market scope.", type: "string" },
    period: { description: "Display label for the evaluation period.", type: "string" },
    scope: { description: "Display label for the targeted keywords or tags.", type: "string" },
    status: {
      enum: ["active", "learning", "paused", "setup"],
      type: "string",
      ...openEnum("AlertRuleStatus"),
    },
  },
  required: [
    "change_pct",
    "channel",
    "channels",
    "competitor_domain",
    "condition",
    "condition_type",
    "drop_positions",
    "enabled",
    "fires",
    "id",
    "market_ids",
    "name",
    "period",
    "recipient_ids",
    "scope",
    "serp_feature",
    "severity",
    "status",
    "target_ids",
    "target_type",
    "threshold_position",
    "top_n",
  ],
  type: "object",
};

/** An alert rule whose `target_ids` are fixed by its `target_type` (lib/api/alert-resources.ts). */
const alertRuleCase = (targetType: string, targetIds: object, name: string) => ({
  ...alertRuleBase,
  properties: {
    ...alertRuleBase.properties,
    target_ids: targetIds,
    target_type: { const: targetType, type: "string" },
  },
  ...sdkName(name),
});

/**
 * The server returns keyword IDs for keyword rules, tag IDs for tag rules and an empty list for
 * rules over all keywords. The last case keeps target types a newer server may add.
 */
export const alertRuleSchema = {
  anyOf: [
    alertRuleCase("keyword", { items: publicIdSchema("kw"), type: "array" }, "KeywordAlertRule"),
    alertRuleCase("tag", { items: publicIdSchema("tag"), type: "array" }, "TagAlertRule"),
    alertRuleCase(
      "all",
      { maxItems: 0, items: publicIdSchema("kw"), type: "array" },
      "AllKeywordsAlertRule",
    ),
    { ...alertRuleBase, ...sdkName("OtherAlertRule") },
  ],
  description:
    "An alert rule. target_ids follow target_type: keyword IDs, tag IDs, or empty for all keywords.",
  ...taggedUnion("target_type", ["keyword", "tag", "all", "other"]),
};

export const triggeredAlertSchema = {
  description:
    "One fired alert as the project alert feed shows it (lib/alerts/alert-data.ts TriggeredAlertView).",
  properties: {
    action: { type: "string" },
    ctas: { items: { type: "string" }, type: "array" },
    current: { type: "string" },
    delivery_attempts: {
      items: {
        properties: {
          channel: alertRuleProperties.channels.items,
          error: { type: ["string", "null"] },
          status: { type: "string" },
          webhook_endpoint_id: { ...publicIdSchema("we"), type: ["string", "null"] },
          webhook_endpoint_label: { type: ["string", "null"] },
          when: { type: "string" },
        },
        required: [
          "channel",
          "error",
          "status",
          "webhook_endpoint_id",
          "webhook_endpoint_label",
          "when",
        ],
        type: "object",
        ...sdkName("AlertDeliveryAttempt"),
      },
      type: "array",
    },
    delivery_state: {
      enum: [
        "dead_letter",
        "delivered",
        "delivering",
        "digest_pending",
        "digested",
        "digesting",
        "pending",
        "skipped",
        "suppressed",
      ],
      type: "string",
      ...openEnum("AlertDeliveryState"),
    },
    feed_meta: {
      properties: {
        engine: { type: "string" },
        language: { type: "string" },
        market: {
          properties: { id: { type: "string" }, label: { type: "string" } },
          required: ["id", "label"],
          type: "object",
          ...sdkName("AlertFeedMarket"),
        },
        module: { type: "string" },
        severity: { type: "string" },
        source: { type: "string" },
      },
      type: "object",
      ...sdkName("AlertFeedMeta"),
    },
    headline: { type: "string" },
    id: publicIdSchema("al"),
    keyword: { type: "string" },
    previous: { type: "string" },
    ranking_url: { type: ["string", "null"] },
    rule: { type: "string" },
    severity: alertRuleProperties.severity,
    target_url: { type: ["string", "null"] },
    unread: { type: "boolean" },
    when: { type: "string" },
  },
  required: [
    "action",
    "ctas",
    "current",
    "delivery_attempts",
    "delivery_state",
    "headline",
    "id",
    "keyword",
    "previous",
    "rule",
    "severity",
    "unread",
    "when",
  ],
  type: "object",
};
