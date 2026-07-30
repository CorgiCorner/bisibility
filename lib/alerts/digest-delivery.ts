import "server-only";

import { prisma } from "@/lib/db/prisma";
import { alertsEmailFrom } from "@/lib/email/from";
import { EmailBudgetExceededError, EmailSendError, sendEmail } from "@/lib/email/send";
import { Prisma } from "@/lib/generated/prisma/client";
import { notifyTriggeredAlertDelivered } from "@/lib/notifications/events";
import {
  classifyPermanentDeliveryFailure,
  deliveryFailureMessage,
  deliveryStateForOutcomes,
  nonRetryableFailure,
  rateLimitedFailure,
} from "@/lib/temporal/delivery-failures";
import {
  type AlertDeliveryChannel,
  DeliveryHttpError,
  postSignedBody,
  sendSlackMessage,
  stampWebhookDelivery,
} from "./delivery";
import { renderAlertDigest } from "./digest-render";
import type { AlertDigestJob } from "./digest-types";
import type { AlertEmailRecipient } from "./recipients";
import { deliverableAlertWhere } from "./transitions";
import { PRIVATE_NETWORK_WEBHOOK_ERROR } from "./webhook-target";

export type AlertDigestDeliveryOutcome = {
  channel: AlertDeliveryChannel;
  delivered: boolean;
  reason?: string;
  skipped?: boolean;
  webhookEndpointId?: string;
};

export async function prepareAlertDigestDeliveryActivity(
  job: AlertDigestJob,
): Promise<AlertDigestJob | null> {
  const now = new Date();
  const rows = await prisma.triggeredAlert.findMany({
    select: { id: true },
    where: {
      deliveryClaimToken: job.deliveryClaimToken,
      deliveryState: "digesting",
      id: { in: job.alertIds },
      ...deliverableAlertWhere(now),
    },
  });
  const deliverableIds = new Set(rows.map(({ id }) => id));
  const skippedIds = job.alertIds.filter((id) => !deliverableIds.has(id));
  if (skippedIds.length > 0) {
    await prisma.triggeredAlert.updateMany({
      data: {
        deliveryClaimedAt: null,
        deliveryClaimToken: null,
        deliveryState: "skipped",
      },
      where: {
        deliveryClaimToken: job.deliveryClaimToken,
        deliveryState: "digesting",
        id: { in: skippedIds },
      },
    });
  }
  const deliverableEntries = job.alertIds.flatMap((triggeredAlertId, index) => {
    const alert = job.alerts[index];
    return alert && deliverableIds.has(triggeredAlertId) ? [{ alert, triggeredAlertId }] : [];
  });
  const alerts = deliverableEntries.map(({ alert }) => alert);
  const firstAlert = alerts[0];
  if (!firstAlert) return null;
  const rendered = renderAlertDigest({
    alerts,
    conditionType: job.conditionType,
    createdAt: new Date(job.createdAt),
    projectDomain: job.projectDomain,
    projectId: firstAlert.projectId,
    projectName: job.projectName,
    ruleId: firstAlert.ruleId,
    ruleName: job.ruleName,
    suppressedTodayCount: job.suppressedTodayCount,
  });
  return {
    ...job,
    alertIds: deliverableEntries.map(({ triggeredAlertId }) => triggeredAlertId),
    alerts,
    email: rendered.email,
    slackText: rendered.slackText,
    webhookBody: rendered.webhookBody,
  };
}

export async function deliverAlertDigestEmailActivity(input: {
  job: AlertDigestJob;
  recipient: AlertEmailRecipient;
}) {
  try {
    await sendEmail({
      ...input.job.email,
      category: "bulk",
      from: alertsEmailFrom(),
      to: input.recipient.email,
    });
    return true;
  } catch (error) {
    const errorMessage = deliveryFailureMessage(error, "Alert digest delivery failed.");
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

export async function deliverAlertDigestSlackActivity(job: AlertDigestJob) {
  if (!job.slackConnection?.enabled) {
    return false;
  }
  try {
    const delivered = await sendSlackMessage(job.slackConnection, job.slackText);
    return delivered;
  } catch (error) {
    const errorMessage = deliveryFailureMessage(error, "Alert digest delivery failed.");
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

export async function deliverAlertDigestWebhookActivity(input: {
  endpointId: string;
  job: AlertDigestJob;
}) {
  const endpoint = await prisma.webhookEndpoint.findUnique({
    select: { enabled: true, hmacSecret: true, id: true, url: true },
    where: { id: input.endpointId },
  });
  if (!endpoint?.enabled) {
    return false;
  }
  try {
    await postSignedBody(endpoint, input.job.webhookBody);
    await stampWebhookDelivery(endpoint.id);
    return true;
  } catch (error) {
    const errorMessage = deliveryFailureMessage(error, "Alert digest delivery failed.");
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

function deliveryAttemptData(
  channel: AlertDeliveryChannel,
  outcomes: AlertDigestDeliveryOutcome[],
  triggeredAlertId: string,
  existingWebhookEndpointIds: Set<string>,
) {
  const channelOutcomes = outcomes.filter((outcome) => outcome.channel === channel);
  const outcomeData = (outcome: AlertDigestDeliveryOutcome) => ({
    channel,
    error: outcome.reason ?? null,
    status: deliveryAttemptStatus(outcome),
    triggeredAlertId,
    ...(outcome.webhookEndpointId && existingWebhookEndpointIds.has(outcome.webhookEndpointId)
      ? { webhookEndpointId: outcome.webhookEndpointId }
      : {}),
  });
  if (channel === "webhook" && channelOutcomes.length > 0) {
    return channelOutcomes.map(outcomeData);
  }

  const sent = channelOutcomes.some((outcome) => outcome.delivered);
  const failed = channelOutcomes.some((outcome) => !outcome.skipped);
  return [
    {
      channel,
      error: channelOutcomes.find((outcome) => outcome.reason)?.reason ?? null,
      status: sent ? "sent" : failed ? "failed" : "skipped",
      triggeredAlertId,
    },
  ];
}

function deliveryAttemptStatus(outcome: AlertDigestDeliveryOutcome) {
  if (outcome.delivered) return "sent";
  return outcome.skipped ? "skipped" : "failed";
}

async function lockExistingWebhookEndpointIds(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  outcomes: AlertDigestDeliveryOutcome[],
) {
  const endpointIds = [
    ...new Set(
      outcomes.flatMap((outcome) => (outcome.webhookEndpointId ? [outcome.webhookEndpointId] : [])),
    ),
  ];
  if (endpointIds.length === 0) return new Set<string>();

  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "webhook_endpoints"
    WHERE "id" IN (${Prisma.join(endpointIds)})
    FOR KEY SHARE
  `);
  return new Set(rows.map((row) => row.id));
}

export async function finalizeAlertDigestDeliveryActivity(input: {
  job: AlertDigestJob;
  outcomes: AlertDigestDeliveryOutcome[];
}) {
  const deliveryState = deliveryStateForOutcomes(input.outcomes, "digested");
  const delivered = deliveryState === "digested";
  const primaryAlertId = input.job.alertIds[0];
  if (!primaryAlertId) return { deliveryState: "skipped" as const };

  const finalized = await prisma.$transaction(async (tx) => {
    const updated = await tx.triggeredAlert.updateMany({
      data: {
        deliveredAt: delivered ? new Date() : null,
        deliveryClaimedAt: null,
        deliveryClaimToken: null,
        deliveryState,
      },
      where: {
        deliveryClaimToken: input.job.deliveryClaimToken,
        deliveryState: "digesting",
        id: { in: input.job.alertIds },
      },
    });
    if (updated.count === 0) return false;
    const existingWebhookEndpointIds = await lockExistingWebhookEndpointIds(tx, input.outcomes);

    for (const channel of input.job.channels) {
      for (const data of deliveryAttemptData(
        channel,
        input.outcomes,
        primaryAlertId,
        existingWebhookEndpointIds,
      )) {
        await tx.deliveryAttempt.create({ data });
      }
    }
    return true;
  });
  if (delivered && finalized) {
    await Promise.all(
      input.job.alerts.flatMap((payload, index) => {
        const triggeredAlertId = input.job.alertIds[index];
        return triggeredAlertId
          ? [
              notifyTriggeredAlertDelivered({
                payload,
                projectInternalId: input.job.projectId,
                triggeredAlertId,
              }).catch(() => undefined),
            ]
          : [];
      }),
    );
  }
  return { deliveryState };
}
