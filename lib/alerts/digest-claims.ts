import { prisma } from "@/lib/db/prisma";
import { notificationTransaction } from "@/lib/notifications/transaction";
import { authorizeDigestRelease } from "./digest-claim-owner";
import { terminalizeDigest } from "./digest-terminalization";
import type { AlertDigestJob } from "./digest-types";
import { deliverableAlertWhere } from "./transitions";

export { createDeliveryClaimToken } from "./digest-claim-owner";
export { recoverStaleDigestClaims } from "./digest-recovery";

export async function renewDigestClaim(job: AlertDigestJob) {
  const ids = [...new Set(job.alertIds)];
  if (!job.deliveryClaimToken || ids.length === 0) return false;
  const renewed = await prisma.triggeredAlert.updateMany({
    data: { deliveryClaimedAt: new Date() },
    where: {
      id: { in: ids },
      deliveryClaimToken: job.deliveryClaimToken,
      deliveryState: "digesting",
    },
  });
  return renewed.count === ids.length;
}

export async function releaseUnsubmittedDigestClaim(alertIds: string[], owner: string) {
  return prisma.$transaction(async (tx) => {
    await authorizeDigestRelease(tx, owner);
    const updated = await tx.triggeredAlert.updateMany({
      data: { deliveryClaimedAt: null, deliveryClaimToken: null, deliveryState: "digest_pending" },
      where: {
        deliveryClaimToken: owner,
        deliveryState: "digesting",
        digestSubmissionStarted: false,
        id: { in: alertIds },
      },
    });
    if (updated.count)
      await tx.alertDigestSend.deleteMany({
        where: { alertId: { in: alertIds }, ownerToken: owner, state: "skipped" },
      });
    return updated;
  });
}

export async function claimPendingDigest(alertIds: string[], owner: string, now: Date) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('bisibility.digest_claim_owner', ${owner}, true)`;
    return tx.triggeredAlert.updateMany({
      data: {
        deliveryClaimedAt: now,
        deliveryClaimToken: owner,
        deliveryState: "digesting",
        digestSubmissionStarted: false,
      },
      where: {
        deliveryState: "digest_pending",
        id: { in: alertIds },
        ...deliverableAlertWhere(now),
      },
    });
  });
}

export async function parkLegacyDigestClaims(job: AlertDigestJob) {
  return notificationTransaction(async (tx) => ({
    count: await terminalizeDigest(
      tx,
      {
        job,
        deliveryState: "dead_letter",
        outcomes: job.channels.map((channel) => ({
          channel,
          delivered: false,
          unknown: true,
          reason: "Legacy digest submission outcome is unknown.",
        })),
      },
      { digestSubmissionStarted: null },
      true,
    ),
  }));
}
