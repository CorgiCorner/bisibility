import type { Prisma } from "@/lib/generated/prisma/client";
import { recoveryWriteGateOpen } from "@/lib/provider-evidence/recovery/predicate";
import { providerRecoveryScope } from "@/lib/provider-evidence/recovery/scope";
import { recoverySwitches } from "@/lib/provider-evidence/recovery/switches";
import { gotoHistoryFailureMarker } from "./goto-history-eligibility";
import type { RetainedRankResultEnvelope } from "./recovery-evidence-envelope";

export async function recoveryResultWriteAllowed(
  tx: Prisma.TransactionClient,
  checkId: string,
  value: RetainedRankResultEnvelope,
  now: Date,
  lease?: { intentId: string; owner: string },
) {
  if (!recoverySwitches().restore) return false;
  if (value.version === 1) return true;
  if (value.version === 2 && value.historicalRepair) {
    if (value.completeness !== "complete") return false;
    return historicalGotoRestoreAllowed(tx, checkId, now, lease);
  }
  if (value.completeness !== "complete" || !value.operationPk || !value.attemptId) return false;
  const identity = await tx.providerDispatchIdentity.findUnique({
    where: { operationPk: value.operationPk },
  });
  const scope = providerRecoveryScope();
  if (
    !identity ||
    identity.rankCheckId !== checkId ||
    identity.namespace !== scope.namespace ||
    identity.instanceId !== scope.instanceId
  )
    return false;
  const operation = await tx.meteringOperation.findUnique({
    where: { operation_pk: value.operationPk },
    include: { paidAttemptContext: true },
  });
  if (!operation) return false;
  await tx.$queryRaw`SELECT operation_id FROM metering_paid_attempt_context WHERE namespace=${operation.namespace} AND operation_id=${operation.operation_id} FOR UPDATE`;
  const original = await tx.meteringPaidAttemptContext.findUnique({
    where: {
      namespace_operation_id: {
        namespace: operation.namespace,
        operation_id: operation.operation_id,
      },
    },
  });
  if (
    !original ||
    original.principal !== identity.principal ||
    original.dispatch_lease_id !== value.attemptId ||
    !original.fenced_at ||
    operation.state === "released" ||
    !recoveryWriteGateOpen(original)
  )
    return false;
  const active = await tx.providerRecoveryIntent.findFirst({
    where: { operationPk: value.operationPk, leaseExpiresAt: { gt: now }, state: "attempting" },
  });
  return !active || (active.id === lease?.intentId && active.leaseOwner === lease.owner);
}

/** A historical envelope cannot complete an unrelated or cancelled check. */
async function historicalGotoRestoreAllowed(
  tx: Prisma.TransactionClient,
  checkId: string,
  now: Date,
  lease?: { intentId: string; owner: string },
) {
  const check = await tx.rankCheck.findUnique({
    where: { id: checkId },
    select: {
      attempts: true,
      error: true,
      errorCode: true,
      raw: true,
      run: { select: { deletedAt: true, status: true } },
      status: true,
    },
  });
  if (!check) return false;
  if (check.status !== "failed") return false;
  if (
    check.run?.deletedAt ||
    check.run?.status === "cancelled" ||
    check.run?.status === "cancelling"
  )
    return false;
  const [review, partial] = await Promise.all([
    tx.providerRecoveryCandidate.findFirst({
      select: { id: true },
      where: { intent: { state: "operator_review" }, rankCheckId: checkId },
    }),
    tx.providerPartialEvidence.findFirst({
      select: { id: true },
      where: {
        expiresAt: { gt: now },
        kind: { in: ["partial", "unresolved"] },
        rankCheckId: checkId,
        schemaVersion: 2,
      },
    }),
  ]);
  if (
    !gotoHistoryFailureMarker({
      attempts: check.attempts,
      error: check.error,
      errorCode: check.errorCode,
      operatorReviewPartial: Boolean(review && partial),
      raw: check.raw,
    })
  )
    return false;
  const active = await tx.providerRecoveryIntent.findFirst({
    where: {
      candidate: { rankCheckId: checkId },
      leaseExpiresAt: { gt: now },
      state: "attempting",
    },
    select: { id: true, leaseOwner: true },
  });
  return !active || (active.id === lease?.intentId && active.leaseOwner === lease.owner);
}
