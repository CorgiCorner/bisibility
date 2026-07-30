import "server-only";

import type { AlertExternalDeliveryPayload } from "../alerts/alert-delivery-payload";
import {
  type AlertDeliveryChannel,
  DeliveryHttpError,
  postSignedWebhook,
  recordDeliveryAttempt,
  sendAlertEmail,
  sendSlackAlert,
  stampWebhookDelivery,
  type TriggeredAlertDeliveryPayload,
} from "../alerts/delivery";
import { PRIVATE_NETWORK_WEBHOOK_ERROR } from "../alerts/webhook-target";
import { prisma } from "../db/prisma";
import { EmailBudgetExceededError, EmailSendError } from "../email/send";
import { notifyTriggeredAlertDelivered } from "../notifications/events";
import {
  classifyPermanentDeliveryFailure,
  deliveryFailureMessage,
  deliveryStateForOutcomes,
  nonRetryableFailure,
  rateLimitedFailure,
} from "./delivery-failures";

export type AlertDeliveryOutcome = {
  channel: AlertDeliveryChannel;
  delivered: boolean;
  recordAttempt?: boolean;
  reason?: string;
  skipped?: boolean;
};

export async function deliverAlertEmailActivity(input: {
  alertId: string;
  payload: TriggeredAlertDeliveryPayload;
  recipientEmail: string;
}) {
  try {
    await sendAlertEmail(input.recipientEmail, input.payload);
    await recordDeliveryAttempt(input.alertId, "email", "sent", null);
  } catch (error) {
    const errorMessage = deliveryFailureMessage(error);
    await recordDeliveryAttempt(input.alertId, "email", "failed", errorMessage);
    if (error instanceof EmailBudgetExceededError) {
      throw nonRetryableFailure(errorMessage, "email_budget_exceeded");
    }
    if (error instanceof EmailSendError && error.status === 429) {
      throw rateLimitedFailure(errorMessage, error.retryAfterSeconds);
    }
    if (error instanceof EmailSendError) {
      const classified = classifyPermanentDeliveryFailure(error, {
        message: errorMessage,
        status: error.status,
      });
      if (classified) throw classified;
    }
    throw error;
  }
}

export async function deliverAlertWebhookActivity(input: {
  alertId: string;
  endpointId: string;
  payload: TriggeredAlertDeliveryPayload;
}) {
  let resolvedEndpointId: string | undefined;
  try {
    const endpoint = await prisma.webhookEndpoint.findUnique({
      select: { enabled: true, hmacSecret: true, id: true, url: true },
      where: { id: input.endpointId },
    });
    resolvedEndpointId = endpoint?.id;
    if (!endpoint?.enabled) throw nonRetryableFailure("Webhook delivery is not configured.");
    await postSignedWebhook(endpoint, input.payload);
    await stampWebhookDelivery(endpoint.id);
    await recordDeliveryAttempt(input.alertId, "webhook", "sent", null, resolvedEndpointId);
  } catch (error) {
    const errorMessage = deliveryFailureMessage(error);
    await recordDeliveryAttempt(
      input.alertId,
      "webhook",
      "failed",
      errorMessage,
      resolvedEndpointId,
    );
    if (error instanceof DeliveryHttpError && error.status === 429) {
      throw rateLimitedFailure(errorMessage, error.retryAfterSeconds);
    }
    const classified = classifyPermanentDeliveryFailure(error, {
      message: errorMessage,
      permanentMessage: errorMessage.includes(PRIVATE_NETWORK_WEBHOOK_ERROR),
      ...(error instanceof DeliveryHttpError ? { status: error.status } : {}),
    });
    if (classified) throw classified;
    throw error;
  }
}

export async function deliverAlertSlackActivity(input: {
  alertId: string;
  payload: TriggeredAlertDeliveryPayload;
  slackConnectionId: string;
}) {
  try {
    const sent = await sendSlackAlert(
      { enabled: true, id: input.slackConnectionId },
      input.payload,
    );
    if (!sent) throw nonRetryableFailure("Slack delivery is not configured.");
    await recordDeliveryAttempt(input.alertId, "slack", "sent", null);
  } catch (error) {
    const errorMessage = deliveryFailureMessage(error);
    await recordDeliveryAttempt(input.alertId, "slack", "failed", errorMessage);
    if (error instanceof DeliveryHttpError && error.status === 429) {
      throw rateLimitedFailure(errorMessage, error.retryAfterSeconds);
    }
    const classified = classifyPermanentDeliveryFailure(error, {
      message: errorMessage,
      permanentMessage: errorMessage.startsWith("Slack alert send failed:"),
      ...(error instanceof DeliveryHttpError ? { status: error.status } : {}),
    });
    if (classified) throw classified;
    throw error;
  }
}

export async function finalizeAlertDeliveryActivity(input: {
  alertId: string;
  deliveryClaimToken: string;
  outcomes: AlertDeliveryOutcome[];
  payload: AlertExternalDeliveryPayload;
  projectInternalId: string;
}) {
  for (const outcome of input.outcomes) {
    if (outcome.recordAttempt) {
      await recordDeliveryAttempt(
        input.alertId,
        outcome.channel,
        outcome.delivered ? "sent" : outcome.skipped ? "skipped" : "failed",
        outcome.reason ?? null,
      );
    }
  }
  const deliveryState = deliveryStateForOutcomes(input.outcomes, "delivered");
  const delivered = deliveryState === "delivered";
  const updated = await prisma.triggeredAlert.updateMany({
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
  if (delivered && updated.count === 1) {
    await notifyTriggeredAlertDelivered({
      payload: input.payload,
      projectInternalId: input.projectInternalId,
      triggeredAlertId: input.alertId,
    }).catch(() => undefined);
  }
  return { deliveryState };
}
