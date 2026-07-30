import "server-only";

import { notifyOps } from "@/lib/ops/notify";
import { redactOpsText } from "@/lib/ops/slack";
import { alertCountLabel } from "./count-label";
import {
  type AlertDeliveryChannel,
  type AlertWebhookEndpoint,
  postSignedBody,
  sendSlackMessage,
} from "./delivery";
import { buildAlertDailyCapReachedWebhookBody } from "./webhook-envelope";

export type AlertOverflowNoticeInput = {
  channels: AlertDeliveryChannel[];
  projectId: string;
  projectPublicId: string;
  ruleId: string;
  rulePublicId: string;
  ruleName: string;
  slackConnection?: { enabled: boolean; id: string } | null;
  suppressedCount: number;
  webhooks: AlertWebhookEndpoint[];
};

function overflowText(input: AlertOverflowNoticeInput) {
  return `Daily delivery-batch cap reached for rule ${input.ruleName}: ${alertCountLabel(input.suppressedCount)} suppressed in this batch; further alerts today will be suppressed until 00:00 UTC. Suppressed alerts remain visible in the app.`;
}

type OverflowNoticeAttempt = {
  channel: "slack" | "webhook";
  promise: Promise<unknown>;
  webhookEndpointId: string | null;
};

export async function sendAlertOverflowNotice(input: AlertOverflowNoticeInput) {
  const text = overflowText(input);
  const attempts: OverflowNoticeAttempt[] = [];

  if (input.channels.includes("slack") && input.slackConnection?.enabled) {
    attempts.push({
      channel: "slack",
      promise: sendSlackMessage(input.slackConnection, text),
      webhookEndpointId: null,
    });
  }
  if (input.channels.includes("webhook")) {
    const createdAt = new Date().toISOString();
    for (const endpoint of input.webhooks) {
      attempts.push({
        channel: "webhook",
        promise: postSignedBody(
          endpoint,
          buildAlertDailyCapReachedWebhookBody(
            {
              projectId: input.projectPublicId,
              ruleId: input.rulePublicId,
              ruleName: input.ruleName,
              suppressedCount: input.suppressedCount,
            },
            createdAt,
          ),
        ),
        webhookEndpointId: endpoint.id,
      });
    }
  }

  const results = await Promise.allSettled(attempts.map(({ promise }) => promise));
  const failed = results.flatMap((result, index) => {
    if (result.status !== "rejected") return [];
    const attempt = attempts[index];
    if (!attempt) return [];
    console.error("[alerts] overflow notice delivery failed", {
      channel: attempt.channel,
      error: redactOpsText(result.reason),
      ruleId: input.ruleId,
      webhookEndpointId: attempt.webhookEndpointId,
    });
    return [attempt];
  });
  if (attempts.length > 0 && failed.length === attempts.length) {
    await notifyOps({
      dedupeKey: `alert-overflow-notice:${input.ruleId}`,
      fields: {
        Attempts: attempts.length,
        Project: input.projectId,
        Rule: input.ruleId,
      },
      kind: "alert_overflow_notice_failure",
      severity: "error",
      title: "Every alert overflow notice channel failed",
    });
  }
}
