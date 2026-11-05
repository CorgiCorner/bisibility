import "server-only";
import { notificationTransaction } from "@/lib/notifications/transaction";
import { authorizeDigestRelease } from "./digest-claim-owner";
import { deliveryPayload, pendingAlertInclude } from "./digest-record";
import { terminalizeDigest } from "./digest-terminalization";
import { PENDING_ALERT_FLUSH_BATCH_LIMIT, STALE_DIGEST_CLAIM_MINUTES } from "./limits";

export async function recoverStaleDigestClaims(now: Date) {
  const staleBefore = new Date(now.getTime() - STALE_DIGEST_CLAIM_MINUTES * 60_000);
  return notificationTransaction(
    async (tx) => {
      const rows = await tx.triggeredAlert.findMany({
        select: {
          id: true,
          deliveryClaimToken: true,
          digestSubmissionStarted: true,
          rule: { select: { channels: true } },
        },
        where: { deliveryClaimedAt: { lt: staleBefore }, deliveryState: "digesting" },
        orderBy: { id: "asc" },
        take: PENDING_ALERT_FLUSH_BATCH_LIMIT,
      });
      let count = 0;
      for (const row of rows) {
        const where = {
          id: row.id,
          deliveryClaimToken: row.deliveryClaimToken,
          digestSubmissionStarted: row.digestSubmissionStarted,
          deliveryClaimedAt: { lt: staleBefore },
          deliveryState: "digesting" as const,
        };
        if (row.digestSubmissionStarted === false && row.deliveryClaimToken) {
          await authorizeDigestRelease(tx, row.deliveryClaimToken);
          const updated = await tx.triggeredAlert.updateMany({
            data: {
              deliveryClaimedAt: null,
              deliveryClaimToken: null,
              deliveryState: "digest_pending",
            },
            where,
          });
          count += updated.count;
          if (updated.count)
            await tx.alertDigestSend.deleteMany({
              where: { alertId: row.id, ownerToken: row.deliveryClaimToken, state: "skipped" },
            });
          continue;
        }
        const detail = await tx.triggeredAlert.findUnique({
          where: { id: row.id },
          include: pendingAlertInclude,
        });
        if (!detail) continue;
        const updated = await terminalizeDigest(
          tx,
          {
            job: {
              alertIds: [row.id],
              alerts: [deliveryPayload(detail)],
              channels: detail.rule.channels,
              deliveryClaimToken: row.deliveryClaimToken,
              projectId: detail.rule.projectId,
              ruleId: detail.ruleId,
            },
            deliveryState: "dead_letter",
            outcomes: row.rule.channels.map((channel) => ({
              channel,
              delivered: false,
              unknown: true,
              reason: "Digest submission outcome is unknown.",
            })),
          },
          where,
          true,
        );
        count += updated;
        if (updated)
          await tx.alertDigestSend.updateMany({
            where: {
              alertId: row.id,
              ownerToken: row.deliveryClaimToken ?? "",
              state: "submitting",
            },
            data: { state: "unknown" },
          });
      }
      return { count };
    },
    { timeout: 30_000 },
  );
}
