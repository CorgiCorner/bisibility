/**
 * Public presentation data for alert email, Slack, notifications, and webhooks.
 * Database and Temporal activity inputs carry the raw triggered-alert primary key
 * separately as `triggeredAlertId`.
 */
export type AlertExternalDeliveryPayload = {
  action: string;
  afterPosition: number | null;
  alertId: string;
  beforePosition: number | null;
  conditionType: string;
  firedAt: string;
  headline: string;
  keyword: string;
  keywordId: string;
  projectDomain: string;
  projectId: string;
  ruleId: string;
  ruleName: string;
  test?: boolean;
};

// Kept as an alias while existing delivery renderers migrate to the explicit name.
export type TriggeredAlertDeliveryPayload = AlertExternalDeliveryPayload;
