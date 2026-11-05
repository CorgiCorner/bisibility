import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { authorizeDigestRelease } from "./digest-claim-owner";
import type { AlertDigestJob } from "./digest-types";
import { ALERT_NOT_DELIVERABLE, alertDeliveryAllowed } from "./send-gate";

/**
 * Keeps the claimed digest alerts that are still deliverable, matched by their public IDs, and
 * records every other claimed alert as skipped with one attempt per channel.
 */
export async function reconcileDigestEntries(job: AlertDigestJob) {
  if (!job.deliveryClaimToken) return [];
  const rows = await alertDeliveryAllowed({
    alertIds: job.alertIds,
    projectId: job.projectId,
    ruleId: job.ruleId,
    deliveryClaimToken: job.deliveryClaimToken,
  });
  const idsByPublicId = new Map(rows.map(({ id, publicId }) => [publicId, id]));
  const deliverableEntries = job.alerts.flatMap((alert) => {
    const triggeredAlertId = idsByPublicId.get(alert.alertId);
    return triggeredAlertId ? [{ alert, triggeredAlertId }] : [];
  });
  const deliverableIds = new Set(
    deliverableEntries.map(({ triggeredAlertId }) => triggeredAlertId),
  );
  const skippedIds = job.alertIds.filter((id) => !deliverableIds.has(id));
  if (skippedIds.length > 0) {
    await prisma.$transaction(async (tx) => {
      const skipped = await tx.triggeredAlert.updateManyAndReturn({
        select: { id: true },
        data: { deliveryClaimedAt: null, deliveryClaimToken: null, deliveryState: "skipped" },
        where: {
          deliveryClaimToken: job.deliveryClaimToken,
          deliveryState: "digesting",
          id: { in: skippedIds },
        },
      });
      for (const { id } of skipped) {
        for (const channel of job.channels) {
          await tx.deliveryAttempt.create({
            data: {
              triggeredAlertId: id,
              channel,
              status: "skipped",
              error: ALERT_NOT_DELIVERABLE,
            },
          });
        }
      }
    });
  }
  return deliverableEntries;
}

type BudgetRow = { deliveryBudgetReservedAt: Date | null; id: string };

// The flush reserved the rule's daily budget once for this delivery, on one of its alerts. Keep
// that reservation on an alert the next flush sends, so the retry does not use a second slot.
async function moveBudgetReservation(
  tx: Prisma.TransactionClient,
  rows: BudgetRow[],
  remainingIds: Set<string>,
) {
  const reservedAt = rows.find((row) => row.deliveryBudgetReservedAt)?.deliveryBudgetReservedAt;
  const holder = rows.find((row) => remainingIds.has(row.id));
  const kept = rows.some((row) => remainingIds.has(row.id) && row.deliveryBudgetReservedAt);
  if (!reservedAt || !holder || kept) return;
  await tx.triggeredAlert.updateMany({
    data: { deliveryBudgetReservedAt: null },
    where: { id: { in: rows.filter((row) => !remainingIds.has(row.id)).map(({ id }) => id) } },
  });
  await tx.triggeredAlert.updateMany({
    data: { deliveryBudgetReservedAt: reservedAt },
    where: { id: holder.id },
  });
}

/**
 * No channel accepted the prepared digest. Records the ineligible alerts as skipped and returns
 * the still-deliverable ones to a later flush, which prepares a fresh digest for them.
 */
export async function releaseStaleDigest(job: AlertDigestJob) {
  const remaining = await reconcileDigestEntries(job);
  if (remaining.length === 0) return "skipped" as const;
  const remainingIds = new Set(remaining.map(({ triggeredAlertId }) => triggeredAlertId));
  const released = await prisma.$transaction(async (tx) => {
    await authorizeDigestRelease(tx, job.deliveryClaimToken);
    const rows = await tx.triggeredAlert.findMany({
      orderBy: [{ firedAt: "asc" }, { id: "asc" }],
      select: { deliveryBudgetReservedAt: true, id: true },
      where: { id: { in: job.alertIds } },
    });
    const updated = await tx.triggeredAlert.updateMany({
      data: { deliveryClaimedAt: null, deliveryClaimToken: null, deliveryState: "digest_pending" },
      where: {
        deliveryClaimToken: job.deliveryClaimToken,
        deliveryState: "digesting",
        id: { in: [...remainingIds] },
      },
    });
    if (updated.count > 0) {
      await tx.alertDigestSend.deleteMany({
        where: {
          alertId: { in: [...remainingIds] },
          ownerToken: job.deliveryClaimToken,
          state: "skipped",
        },
      });
      await moveBudgetReservation(tx, rows, remainingIds);
    }
    return updated.count;
  });
  return released > 0 ? ("digest_pending" as const) : ("skipped" as const);
}
