// Frozen legacy implementation from 25351a5bd33132bd0de51fa699867c703ce98835.
import "server-only";

import {
  type AlertDeliveryChannel,
  postSignedBody,
  sendSlackMessage,
  stampWebhookDelivery,
} from "@/lib/alerts/delivery";
import { reconcileDigestEntries, releaseStaleDigest } from "@/lib/alerts/digest-reconcile";
import { renderAlertDigest } from "@/lib/alerts/digest-render";
import type { AlertDigestJob } from "@/lib/alerts/digest-types";
import {
  ALERT_NOT_DELIVERABLE,
  alertDeliveryAllowed,
  allAlertsDeliverable,
  digestRefusal,
} from "@/lib/alerts/send-gate";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { notifyTriggeredAlertDelivered } from "@/lib/notifications/events";
import {
  classifyDeliveryFailure,
  deliveryFailureMessage,
  deliveryStateForOutcomes,
} from "@/lib/temporal/delivery-failures";

export type AlertDigestDeliveryOutcome = {
  channel: AlertDeliveryChannel;
  delivered: boolean;
  reason?: string;
  retried?: boolean;
  skipped?: boolean;
  unknown?: boolean;
  webhookEndpointId?: string;
};

export async function prepareAlertDigestDeliveryActivity(
  job: AlertDigestJob,
): Promise<AlertDigestJob | null> {
  const deliverableEntries = await reconcileDigestEntries(job);
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

export { deliverAlertDigestEmailActivity } from "@/lib/alerts/digest-email";

export async function deliverAlertDigestSlackActivity(job: AlertDigestJob) {
  if (!job.slackConnection?.enabled) return digestRefusal("Slack delivery is not configured.");
  if (
    !(await allAlertsDeliverable({
      alertIds: job.alertIds,
      projectId: job.projectId,
      ruleId: job.ruleId,
    }))
  ) {
    return digestRefusal(ALERT_NOT_DELIVERABLE);
  }
  try {
    const delivered = await sendSlackMessage(job.slackConnection, job.slackText);
    return delivered
      ? { delivered: true, skipped: false }
      : digestRefusal("Slack delivery is not configured.");
  } catch (error) {
    const errorMessage = deliveryFailureMessage(error, "Alert digest delivery failed.");
    throw classifyDeliveryFailure(error, "slack", errorMessage);
  }
}

export async function deliverAlertDigestWebhookActivity(input: {
  endpointId: string;
  job: AlertDigestJob;
}) {
  if (
    !(await allAlertsDeliverable({
      alertIds: input.job.alertIds,
      projectId: input.job.projectId,
      ruleId: input.job.ruleId,
    }))
  ) {
    return digestRefusal(ALERT_NOT_DELIVERABLE);
  }
  const endpoint = await prisma.webhookEndpoint.findUnique({
    select: { enabled: true, hmacSecret: true, id: true, url: true },
    where: { id: input.endpointId },
  });
  if (!endpoint?.enabled) return digestRefusal("Webhook delivery is not configured.");
  try {
    await postSignedBody(endpoint, input.job.webhookBody);
    await stampWebhookDelivery(endpoint.id);
    return { delivered: true, skipped: false };
  } catch (error) {
    const errorMessage = deliveryFailureMessage(error, "Alert digest delivery failed.");
    throw classifyDeliveryFailure(error, "webhook", errorMessage);
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
  if ((channel === "webhook" || channel === "email") && channelOutcomes.length > 0) {
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
  if (outcome.unknown) return "unknown";
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
  // Requeue only when no attempt could have reached a transport: a refusal on a retried
  // attempt may follow one that the transport accepted.
  if (
    deliveryState === "skipped" &&
    input.outcomes.some((outcome) => outcome.reason === ALERT_NOT_DELIVERABLE) &&
    !input.outcomes.some((outcome) => outcome.retried)
  ) {
    return { deliveryState: await releaseStaleDigest(input.job) };
  }
  const delivered = deliveryState === "digested";
  if (input.job.alertIds.length === 0) return { deliveryState: "skipped" as const };

  const finalized = await prisma.$transaction(async (tx) => {
    const updated = await tx.triggeredAlert.updateManyAndReturn({
      select: { id: true, publicId: true },
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
    if (updated.length === 0) return [];
    const primaryAlertId = updated[0].id;
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
    return updated;
  });
  // In-app notifications do not depend on an external digest channel succeeding.
  if (finalized.length > 0) {
    // The in-app notification is a send too: it needs an enabled rule and a deliverable alert.
    const notifiable = await alertDeliveryAllowed({
      alertIds: finalized.map(({ id }) => id),
      projectId: input.job.projectId,
      ruleId: input.job.ruleId,
    });
    const idsByPublicId = new Map(notifiable.map(({ id, publicId }) => [publicId, id]));
    await Promise.all(
      input.job.alerts.flatMap((payload) => {
        const triggeredAlertId = idsByPublicId.get(payload.alertId);
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
