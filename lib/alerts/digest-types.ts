import type { AlertDeliveryChannel, TriggeredAlertDeliveryPayload } from "./delivery";
import type { AlertEmailRecipient } from "./recipients";
import type { AlertDigestWebhookEnvelope } from "./webhook-envelope";

export type AlertDigestJob = {
  alertIds: string[];
  alerts: TriggeredAlertDeliveryPayload[];
  channels: AlertDeliveryChannel[];
  conditionType: string;
  createdAt: string;
  deliveryClaimToken: string;
  email: { html: string; subject: string; text: string };
  projectDomain: string;
  projectId: string;
  projectName: string;
  recipients: AlertEmailRecipient[];
  ruleId: string;
  ruleName: string;
  slackConnection?: { enabled: boolean; id: string } | null;
  slackText: string;
  suppressedTodayCount: number;
  webhookBody: AlertDigestWebhookEnvelope;
  webhookEndpointIds: string[];
};

export type AlertDigestDeliveryResult = {
  delivered: boolean;
  messagesSent: number;
};
