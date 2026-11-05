import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { notifyTriggeredAlertsDelivered } from "@/lib/notifications/events";
import type { AlertDeliveryChannel } from "./delivery";
import {
  countedDeliveryStatus,
  type DeliveryCounts,
  storedDeliveryCounts,
} from "./delivery-counts";
import type { AlertDigestDeliveryOutcome } from "./digest-delivery";
import type { AlertDigestJob } from "./digest-types";
import { alertDeliveryAllowed } from "./send-gate";

export type DigestTerminalJob = Pick<
  AlertDigestJob,
  "alertIds" | "alerts" | "channels" | "projectId" | "ruleId"
> & { deliveryClaimToken: string | null };

function deliveryAttemptData(
  channel: AlertDeliveryChannel,
  outcomes: AlertDigestDeliveryOutcome[],
  triggeredAlertId: string,
  existingWebhookEndpointIds: Set<string>,
): Prisma.DeliveryAttemptCreateManyInput[] {
  const channelOutcomes = outcomes.filter((outcome) => outcome.channel === channel);
  if (
    channel === "email" ||
    (channel === "push" && channelOutcomes.some((outcome) => outcome.counts))
  ) {
    const counts = channelOutcomes.reduce<DeliveryCounts>(
      (sum, outcome) => {
        const measured = outcome.counts ?? {
          acceptedCount: outcome.delivered ? 1 : 0,
          failedCount: !outcome.delivered && !outcome.skipped && !outcome.unknown ? 1 : 0,
          unknownCount: outcome.unknown ? 1 : 0,
        };
        return {
          acceptedCount: sum.acceptedCount + measured.acceptedCount,
          failedCount: sum.failedCount + measured.failedCount,
          unknownCount: sum.unknownCount + measured.unknownCount,
        };
      },
      { acceptedCount: 0, failedCount: 0, unknownCount: 0 },
    );
    return [
      {
        channel,
        ...counts,
        error: channelOutcomes.find((outcome) => outcome.reason)?.reason ?? null,
        status: countedDeliveryStatus(counts),
        triggeredAlertId,
      },
    ];
  }
  return channelOutcomes.length > 0
    ? channelOutcomes.map((outcome) => ({
        channel,
        error: outcome.reason ?? null,
        status: outcome.unknown
          ? "unknown"
          : outcome.delivered
            ? "sent"
            : outcome.skipped
              ? "skipped"
              : "failed",
        triggeredAlertId,
        ...(outcome.webhookEndpointId && existingWebhookEndpointIds.has(outcome.webhookEndpointId)
          ? { webhookEndpointId: outcome.webhookEndpointId }
          : {}),
      }))
    : [{ channel, error: null, status: "skipped", triggeredAlertId }];
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

/** The caller owns the notification transaction, including recovery receipt updates. */
export async function terminalizeDigest(
  tx: Prisma.TransactionClient,
  input: {
    job: DigestTerminalJob;
    outcomes: AlertDigestDeliveryOutcome[];
    deliveryState: "digested" | "dead_letter" | "skipped";
  },
  where: Prisma.TriggeredAlertWhereInput = {},
  perAlert = false,
) {
  const { deliveryState } = input;
  const delivered = deliveryState === "digested";
  // Project deletion takes this lock before cascading through alerts.
  await tx.$queryRaw`SELECT id FROM projects WHERE id=${input.job.projectId} FOR KEY SHARE`;
  const deliverySummary = input.job.channels.flatMap((channel) =>
    deliveryAttemptData(channel, input.outcomes, "", new Set()).flatMap((row) => {
      const counts = storedDeliveryCounts(row);
      return [{ channel: row.channel, ...(counts ? { counts } : {}), status: row.status }];
    }),
  );
  const updated = await tx.triggeredAlert.updateManyAndReturn({
    select: { id: true, publicId: true },
    data: {
      deliveredAt: delivered ? new Date() : null,
      deliveryClaimedAt: null,
      deliveryClaimToken: null,
      deliveryState,
      deliverySummary,
    },
    where: {
      ...where,
      deliveryClaimToken: input.job.deliveryClaimToken,
      deliveryState: "digesting",
      id: { in: input.job.alertIds },
    },
  });
  if (updated.length === 0) return 0;
  const attemptIds = perAlert ? updated.map(({ id }) => id) : [updated[0].id];
  const existingWebhookEndpointIds = await lockExistingWebhookEndpointIds(tx, input.outcomes);

  for (const primaryAlertId of attemptIds) {
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
  }
  // In-app notifications do not depend on an external digest channel succeeding.
  // The in-app notification is a send too: it needs an enabled rule and a deliverable alert.
  const notifiable = await alertDeliveryAllowed(
    {
      alertIds: updated.map(({ id }) => id),
      projectId: input.job.projectId,
      ruleId: input.job.ruleId,
    },
    tx,
  );
  const idsByPublicId = new Map(notifiable.map(({ id, publicId }) => [publicId, id]));
  await notifyTriggeredAlertsDelivered(
    input.job.projectId,
    input.job.alerts.flatMap((payload) => {
      const triggeredAlertId = idsByPublicId.get(payload.alertId);
      return triggeredAlertId ? [{ payload, triggeredAlertId }] : [];
    }),
    tx,
  );
  return updated.length;
}
