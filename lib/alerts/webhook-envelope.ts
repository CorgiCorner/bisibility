import { isPublicIdOfType, type PublicIdPrefix } from "@/lib/db/public-id";
import type { TriggeredAlertDeliveryPayload } from "./alert-delivery-payload";

export const ALERT_WEBHOOK_ENVELOPE_CONTRACT = {
  events: {
    dailyCapReached: "alert.daily_cap_reached",
    digest: "alert.digest",
    fired: "alert.fired",
    test: "webhook.test",
  },
  schemaVersion: 3,
} as const;

export type AlertWebhookEvent =
  (typeof ALERT_WEBHOOK_ENVELOPE_CONTRACT.events)[keyof typeof ALERT_WEBHOOK_ENVELOPE_CONTRACT.events];

/**
 * Version 3 is the final public-ID prefix contract. Internal Temporal identifiers stay
 * in worker inputs and never appear in this payload.
 */
type VersionedAlertWebhookEnvelope<TEvent extends AlertWebhookEvent, TData> = {
  created_at: string;
  data: TData;
  event: TEvent;
  schemaVersion: typeof ALERT_WEBHOOK_ENVELOPE_CONTRACT.schemaVersion;
};

export type AlertDigestWebhookData = {
  alert_count: number;
  alerts: AlertWebhookPayload[];
  condition_type: string;
  project_domain: string;
  project_id: string;
  rule_id: string;
  rule_name: string;
  suppressed_today_count: number;
};

export type AlertDailyCapReachedWebhookData = {
  project_id: string;
  rule_id: string;
  rule_name: string;
  suppressed_count: number;
};

export type AlertWebhookPayload = {
  action: string;
  after_position: number | null;
  alert_id: string;
  before_position: number | null;
  condition_type: string;
  fired_at: string;
  headline: string;
  keyword: string;
  keyword_id: string;
  project_domain: string;
  project_id: string;
  rule_id: string;
  rule_name: string;
  test?: boolean;
};

export type WebhookTestData = {
  project_domain: string;
  project_id: string;
  webhook_id?: string;
};

export type AlertFiredWebhookEnvelope = VersionedAlertWebhookEnvelope<
  typeof ALERT_WEBHOOK_ENVELOPE_CONTRACT.events.fired,
  AlertWebhookPayload
>;

export type AlertDigestWebhookEnvelope = VersionedAlertWebhookEnvelope<
  typeof ALERT_WEBHOOK_ENVELOPE_CONTRACT.events.digest,
  AlertDigestWebhookData
>;

export type AlertDailyCapReachedWebhookEnvelope = VersionedAlertWebhookEnvelope<
  typeof ALERT_WEBHOOK_ENVELOPE_CONTRACT.events.dailyCapReached,
  AlertDailyCapReachedWebhookData
>;

export type WebhookTestEnvelope = VersionedAlertWebhookEnvelope<
  typeof ALERT_WEBHOOK_ENVELOPE_CONTRACT.events.test,
  WebhookTestData
>;

export type AlertWebhookEnvelope =
  | AlertDailyCapReachedWebhookEnvelope
  | AlertDigestWebhookEnvelope
  | AlertFiredWebhookEnvelope
  | WebhookTestEnvelope;

function buildAlertWebhookEnvelope<TEvent extends AlertWebhookEvent, TData>(
  event: TEvent,
  data: TData,
  createdAt: string,
): VersionedAlertWebhookEnvelope<TEvent, TData> {
  return {
    created_at: createdAt,
    data,
    event,
    schemaVersion: ALERT_WEBHOOK_ENVELOPE_CONTRACT.schemaVersion,
  };
}

function publicPayload(data: TriggeredAlertDeliveryPayload): AlertWebhookPayload {
  return {
    action: data.action,
    after_position: data.afterPosition,
    alert_id: requireWebhookPublicId(data.alertId, "al"),
    before_position: data.beforePosition,
    condition_type: data.conditionType,
    fired_at: data.firedAt,
    headline: data.headline,
    keyword: data.keyword,
    keyword_id: requireWebhookPublicId(data.keywordId, "kw"),
    project_domain: data.projectDomain,
    project_id: requireWebhookPublicId(data.projectId, "prj"),
    rule_id: requireWebhookPublicId(data.ruleId, "alr"),
    rule_name: data.ruleName,
    ...(data.test === undefined ? {} : { test: data.test }),
  };
}

function requireWebhookPublicId(value: string, prefix: PublicIdPrefix) {
  if (!isPublicIdOfType(value, prefix)) {
    throw new Error(`Alert webhook payload requires a v3 ${prefix} public ID.`);
  }
  return value;
}

export function buildAlertFiredWebhookBody(
  data: TriggeredAlertDeliveryPayload,
  createdAt = new Date().toISOString(),
): AlertFiredWebhookEnvelope {
  return buildAlertWebhookEnvelope(
    ALERT_WEBHOOK_ENVELOPE_CONTRACT.events.fired,
    publicPayload(data),
    createdAt,
  );
}

export function buildAlertDigestWebhookBody(
  data: Omit<AlertDigestWebhookData, "alerts"> & { alerts: TriggeredAlertDeliveryPayload[] },
  createdAt: string,
): AlertDigestWebhookEnvelope {
  return buildAlertWebhookEnvelope(
    ALERT_WEBHOOK_ENVELOPE_CONTRACT.events.digest,
    { ...data, alerts: data.alerts.map(publicPayload) },
    createdAt,
  );
}

export function buildAlertDailyCapReachedWebhookBody(
  data: {
    projectId: string;
    ruleId: string;
    ruleName: string;
    suppressedCount: number;
  },
  createdAt: string,
): AlertDailyCapReachedWebhookEnvelope {
  return buildAlertWebhookEnvelope(
    ALERT_WEBHOOK_ENVELOPE_CONTRACT.events.dailyCapReached,
    {
      project_id: requireWebhookPublicId(data.projectId, "prj"),
      rule_id: requireWebhookPublicId(data.ruleId, "alr"),
      rule_name: data.ruleName,
      suppressed_count: data.suppressedCount,
    },
    createdAt,
  );
}

export function buildWebhookTestBody(
  data: { projectDomain: string; projectId: string; webhookId?: string | null },
  createdAt = new Date().toISOString(),
): WebhookTestEnvelope {
  return buildAlertWebhookEnvelope(
    ALERT_WEBHOOK_ENVELOPE_CONTRACT.events.test,
    {
      project_domain: data.projectDomain,
      project_id: requireWebhookPublicId(data.projectId, "prj"),
      ...(data.webhookId ? { webhook_id: requireWebhookPublicId(data.webhookId, "we") } : {}),
    },
    createdAt,
  );
}
