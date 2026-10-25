import { notificationTransaction } from "@/lib/notifications/transaction";
import { refreshOperationIncident } from "@/lib/provider-evidence/incidents/refresh";
import "server-only";
import { lookupFailure } from "./outcomes";
import { recoveryRetryPlan } from "./retry";
import { providerRecoveryScope } from "./scope";

/** An interrupted transaction is retryable. It never becomes an implicit operator acknowledgement. */
export async function retryInterruptedRecovery(
  lease: { intentId: string; owner: string },
  now = new Date(),
) {
  return notificationTransaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM provider_recovery_intents WHERE id=${lease.intentId} FOR UPDATE`;
    const intent = await tx.providerRecoveryIntent.findFirst({
      where: {
        id: lease.intentId,
        candidate: providerRecoveryScope(),
        leaseOwner: lease.owner,
        state: "attempting",
        leaseExpiresAt: { gt: now },
      },
    });
    if (!intent) return;
    const identity = await tx.providerDispatchIdentity.findUnique({
      where: { operationPk: intent.operationPk },
    });
    const evidence = await tx.providerOperationEvidence.findUniqueOrThrow({
      where: { operationPk: intent.operationPk },
    });
    const plan = recoveryRetryPlan({
      outcome: lookupFailure("outage", "history_transport_unavailable", 60000),
      identity,
      attempts: intent.attempts,
      accounting: evidence.accounting ?? "unknown",
      reason: "lookup_interrupted",
      resultPending: true,
      resultComplete: false,
      now,
    });
    await tx.providerRecoveryIntent.update({
      where: { id: intent.id },
      data: {
        state: plan.state,
        reason: plan.reason,
        nextAttemptAt: plan.nextAttemptAt,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    await tx.providerOperationEvidence.update({
      where: { operationPk: intent.operationPk },
      data: {
        accounting: evidence.accounting ?? "unknown",
        recoveryState: plan.state,
        recoveryReason: plan.reason,
        lastAttemptAt: intent.lastAttemptAt,
        nextAttemptAt: plan.nextAttemptAt,
        exhaustionStatus: plan.exhaustionStatus,
        exhaustionReason: plan.exhaustionReason,
      },
    });
    await refreshOperationIncident(tx, intent.operationPk);
    return plan;
  });
}
