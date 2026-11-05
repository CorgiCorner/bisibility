import "server-only";

import { type DeliverySummary, storedDeliveryCounts } from "@/lib/alerts/delivery-counts";
import { prisma } from "@/lib/db/prisma";

/** Complete classification evidence is independent of the feed's bounded attempt log. */
export async function loadAlertDeliveryOutcomes(alertIds: readonly string[]) {
  if (alertIds.length === 0) return new Map<string, DeliverySummary[]>();
  const attempts = await prisma.deliveryAttempt.findMany({
    orderBy: [{ attemptedAt: "desc" }, { id: "desc" }],
    select: {
      acceptedCount: true,
      channel: true,
      failedCount: true,
      id: true,
      status: true,
      triggeredAlertId: true,
      unknownCount: true,
      webhookEndpointId: true,
    },
    where: { triggeredAlertId: { in: [...alertIds] } },
  });
  const byAlert = new Map<string, Map<string, (typeof attempts)[number]>>();
  for (const attempt of attempts) {
    const outcomes =
      byAlert.get(attempt.triggeredAlertId) ?? new Map<string, (typeof attempts)[number]>();
    // Without recipient/destination identity, a newer row cannot prove recovery.
    const key =
      attempt.channel === "email" || (attempt.channel === "webhook" && !attempt.webhookEndpointId)
        ? attempt.id
        : `${attempt.channel}:${attempt.webhookEndpointId ?? ""}`;
    if (!outcomes.has(key)) outcomes.set(key, attempt);
    byAlert.set(attempt.triggeredAlertId, outcomes);
  }
  return new Map(
    [...byAlert].map(([id, outcomes]) => [
      id,
      [...outcomes.values()].map((attempt): DeliverySummary => {
        const counts = storedDeliveryCounts(attempt);
        return { channel: attempt.channel, ...(counts ? { counts } : {}), status: attempt.status };
      }),
    ]),
  );
}
