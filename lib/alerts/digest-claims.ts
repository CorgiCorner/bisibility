import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { STALE_DIGEST_CLAIM_MINUTES } from "./limits";

export function createDeliveryClaimToken() {
  return randomUUID();
}

export async function recoverStaleDigestClaims(now: Date) {
  const staleBefore = new Date(now.getTime() - STALE_DIGEST_CLAIM_MINUTES * 60_000);
  return prisma.triggeredAlert.updateMany({
    data: {
      deliveryClaimedAt: null,
      deliveryClaimToken: null,
      deliveryState: "digest_pending",
    },
    where: { deliveryClaimedAt: { lt: staleBefore }, deliveryState: "digesting" },
  });
}
