import type { PushMessage } from "@/lib/notifications/apns";
import type { AlertExternalDeliveryPayload } from "./alert-delivery-payload";

export type PushRuleFacts = { conditionType: string; topN: number | null };

function position(value: number | null): string {
  return value == null ? "not ranked" : `#${value}`;
}

function titleFor(rule: PushRuleFacts, payload: AlertExternalDeliveryPayload): string {
  if (rule.conditionType === "exits_top_n" && rule.topN) {
    return `Keyword fell out of the top ${rule.topN}`;
  }
  if (rule.conditionType === "enters_top_n" && rule.topN) {
    return `Keyword entered the top ${rule.topN}`;
  }
  if (
    rule.conditionType === "position_drop" &&
    payload.beforePosition != null &&
    payload.afterPosition != null
  ) {
    return `Keyword dropped ${payload.afterPosition - payload.beforePosition} positions`;
  }
  return "Keyword alert";
}

/**
 * One alert as a push notification. Carries the keyword and positions only,
 * no SERP data, plus public ids for deep linking. Repeated alerts for the same
 * rule and keyword replace each other on the device; a project is one thread.
 */
export function alertPushMessage(
  rule: PushRuleFacts,
  payload: AlertExternalDeliveryPayload,
): PushMessage {
  const rankCondition = ["enters_top_n", "exits_top_n", "position_drop"].includes(
    rule.conditionType,
  );
  return {
    body: rankCondition
      ? `"${payload.keyword}" is now ${position(payload.afterPosition)} (was ${position(payload.beforePosition)}).`
      : payload.headline,
    collapseId: `${payload.ruleId}:${payload.keywordId}`,
    data: {
      alert_id: payload.alertId,
      keyword_id: payload.keywordId,
      project_id: payload.projectId,
      rule_id: payload.ruleId,
    },
    threadId: payload.projectId,
    title: titleFor(rule, payload),
  };
}

/** A digest becomes one summary push per device instead of one per alert. */
export function digestPushMessage(input: {
  alerts: AlertExternalDeliveryPayload[];
  projectDomain: string;
  projectId: string;
  ruleId: string;
  ruleName: string;
}): PushMessage {
  const [first] = input.alerts;
  const more = input.alerts.length - 1;
  return {
    body: first
      ? `${first.headline}${more > 0 ? ` and ${more} more` : ""} on ${input.projectDomain}.`
      : input.projectDomain,
    collapseId: `${input.ruleId}:digest`,
    data: { project_id: input.projectId, rule_id: input.ruleId },
    threadId: input.projectId,
    title: `${input.ruleName}: ${input.alerts.length} keyword alert${input.alerts.length === 1 ? "" : "s"}`,
  };
}
