import type { Prisma } from "@/lib/generated/prisma/client";
import { refreshOperationIncident } from "@/lib/provider-evidence/incidents/refresh";
import type { RetainedRankResultEnvelope } from "./recovery-evidence-envelope";

/** Maintenance can finish a staged result after proof import was enabled separately. */
export async function finalizeRestoredRecovery(
  tx: Prisma.TransactionClient,
  value: RetainedRankResultEnvelope,
) {
  if (value.version !== 2 || !value.operationPk || !value.attemptId) return;
  const evidence = await tx.providerOperationEvidence.findUnique({
    where: { operationPk: value.operationPk },
  });
  if (!evidence) return;
  const terminal =
    evidence.accounting === "measured" ||
    (evidence.accounting === "unknown" && evidence.exhaustionStatus === "exhausted");
  await tx.providerOperationEvidence.update({
    where: { operationPk: value.operationPk },
    data: {
      fulfillment: "complete",
      ...(terminal ? { recoveryState: "resolved", nextAttemptAt: null } : {}),
    },
  });
  await refreshOperationIncident(tx, value.operationPk);
  if (terminal)
    await tx.providerRecoveryIntent.updateMany({
      where: { operationPk: value.operationPk, attemptId: value.attemptId, leaseOwner: null },
      data: { state: "resolved", nextAttemptAt: null },
    });
}
