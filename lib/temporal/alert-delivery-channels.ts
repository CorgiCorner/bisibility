import "server-only";

import type { AlertExternalDeliveryPayload } from "../alerts/alert-delivery-payload";
import {
  type AlertDeliveryChannel,
  postSignedWebhook,
  recordDeliveryAttempt,
  sendSlackAlert,
  stampWebhookDelivery,
  type TriggeredAlertDeliveryPayload,
} from "../alerts/delivery";
import {
  countedDeliveryStatus,
  type DeliveryCounts,
  PUSH_NOT_CONFIGURED_TYPE,
} from "../alerts/delivery-counts";
import { deliverPushToProject } from "../alerts/push-delivery";
import { ALERT_NOT_DELIVERABLE, allAlertsDeliverable } from "../alerts/send-gate";
import { prisma } from "../db/prisma";
import { defaultPushSender, type PushMessage } from "../notifications/apns";
import { notifyTriggeredAlertDelivered } from "../notifications/events";
import { notificationTransaction } from "../notifications/transaction";
import {
  classifyDeliveryFailure,
  deliveryFailureMessage,
  deliveryStateForOutcomes,
  nonRetryableFailure,
} from "./delivery-failures";

export const PUSH_NOT_CONFIGURED = "Push delivery is not configured.";

export type AlertDeliveryOutcome = {
  channel: AlertDeliveryChannel;
  delivered: boolean;
  reason?: string;
  recordAttempt?: boolean;
  skipped?: boolean;
  unknown?: boolean;
};

export { deliverAlertEmailActivity } from "../alerts/alert-email-activity";

export async function deliverAlertWebhookActivity(input: {
  alertId: string;
  endpointId: string;
  payload: TriggeredAlertDeliveryPayload;
}) {
  let resolvedEndpointId: string | undefined;
  try {
    if (!(await allAlertsDeliverable({ alertIds: [input.alertId] }))) {
      const reason = ALERT_NOT_DELIVERABLE;
      await recordDeliveryAttempt(input.alertId, "webhook", "skipped", reason);
      return { delivered: false, skipped: true, reason };
    }
    const endpoint = await prisma.webhookEndpoint.findUnique({
      select: { enabled: true, hmacSecret: true, id: true, url: true },
      where: { id: input.endpointId },
    });
    resolvedEndpointId = endpoint?.id;
    if (!endpoint?.enabled) throw nonRetryableFailure("Webhook delivery is not configured.");
    await postSignedWebhook(endpoint, input.payload);
    await stampWebhookDelivery(endpoint.id);
    await recordDeliveryAttempt(input.alertId, "webhook", "sent", null, resolvedEndpointId);
    return { delivered: true, skipped: false };
  } catch (error) {
    const errorMessage = deliveryFailureMessage(error);
    await recordDeliveryAttempt(
      input.alertId,
      "webhook",
      "failed",
      errorMessage,
      resolvedEndpointId,
    );
    throw classifyDeliveryFailure(error, "webhook", errorMessage);
  }
}

export async function deliverAlertSlackActivity(input: {
  alertId: string;
  payload: TriggeredAlertDeliveryPayload;
  slackConnectionId: string;
}) {
  try {
    if (!(await allAlertsDeliverable({ alertIds: [input.alertId] }))) {
      const reason = ALERT_NOT_DELIVERABLE;
      await recordDeliveryAttempt(input.alertId, "slack", "skipped", reason);
      return { delivered: false, skipped: true, reason };
    }
    const sent = await sendSlackAlert(
      { enabled: true, id: input.slackConnectionId },
      input.payload,
    );
    if (!sent) throw nonRetryableFailure("Slack delivery is not configured.");
    await recordDeliveryAttempt(input.alertId, "slack", "sent", null);
    return { delivered: true, skipped: false };
  } catch (error) {
    const errorMessage = deliveryFailureMessage(error);
    await recordDeliveryAttempt(input.alertId, "slack", "failed", errorMessage);
    throw classifyDeliveryFailure(error, "slack", errorMessage);
  }
}

export type PushActivityResult = {
  delivered: boolean;
  reason?: string;
  skipped: boolean;
  counts?: DeliveryCounts;
};

/**
 * Sends the alert to every registered device of the project's members. A
 * measured batch completes without replaying devices, including ambiguous sends.
 */
export async function deliverAlertPushActivity(input: {
  alertId: string;
  message: PushMessage;
  projectInternalId: string;
}): Promise<PushActivityResult> {
  if (!(await allAlertsDeliverable({ alertIds: [input.alertId] }))) {
    await recordDeliveryAttempt(input.alertId, "push", "skipped", ALERT_NOT_DELIVERABLE);
    return { delivered: false, skipped: true, reason: ALERT_NOT_DELIVERABLE };
  }
  const sender = defaultPushSender();
  if (!sender) {
    await recordDeliveryAttempt(input.alertId, "push", "failed", PUSH_NOT_CONFIGURED);
    throw nonRetryableFailure(PUSH_NOT_CONFIGURED, PUSH_NOT_CONFIGURED_TYPE);
  }
  const result = await deliverPushToProject(sender, input.projectInternalId, input.message);
  const counts = {
    acceptedCount: result.acceptedCount,
    failedCount: result.failedCount,
    unknownCount: result.unknownCount,
  };
  const status = countedDeliveryStatus(counts);
  const reason = status === "skipped" ? "No registered devices." : undefined;
  await recordDeliveryAttempt(input.alertId, "push", status, reason ?? null, undefined, counts);
  return { delivered: counts.acceptedCount > 0, skipped: status === "skipped", counts };
}

export async function finalizeAlertDeliveryActivity(input: {
  alertId: string;
  deliveryClaimToken: string;
  outcomes: AlertDeliveryOutcome[];
  payload: AlertExternalDeliveryPayload;
  projectInternalId: string;
}) {
  const deliveryState = deliveryStateForOutcomes(input.outcomes, "delivered");
  const delivered = deliveryState === "delivered";
  await notificationTransaction(async (tx) => {
    // Project deletion takes this lock before cascading through alerts.
    await tx.$queryRaw`SELECT id FROM projects WHERE id=${input.projectInternalId} FOR KEY SHARE`;
    const updated = await tx.triggeredAlert.updateMany({
      data: {
        deliveredAt: delivered ? new Date() : null,
        deliveryClaimedAt: null,
        deliveryClaimToken: null,
        deliveryState,
      },
      where: {
        deliveryClaimToken: input.deliveryClaimToken,
        deliveryState: "delivering",
        id: input.alertId,
      },
    });
    if (updated.count !== 1) return;
    for (const outcome of input.outcomes) {
      if (outcome.recordAttempt) {
        await tx.deliveryAttempt.create({
          data: {
            triggeredAlertId: input.alertId,
            channel: outcome.channel,
            status: outcome.unknown
              ? "unknown"
              : outcome.delivered
                ? "sent"
                : outcome.skipped
                  ? "skipped"
                  : "failed",
            error: outcome.reason?.slice(0, 500) ?? null,
          },
        });
      }
    }
    // The in-app notification is its own channel: it must not depend on an external channel
    // being configured or succeeding. Suppressed alerts (snooze, daily cap) never reach here, and
    // a rule switched off or an alert resolved before finalization gets no notification.
    if (
      await allAlertsDeliverable(
        {
          alertIds: [input.alertId],
          projectId: input.projectInternalId,
        },
        tx,
      )
    ) {
      await notifyTriggeredAlertDelivered(
        {
          payload: input.payload,
          projectInternalId: input.projectInternalId,
          triggeredAlertId: input.alertId,
        },
        tx,
      );
    }
  });
  return { deliveryState };
}
