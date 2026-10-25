import { recoveryWriteGateOpen } from "./predicate";
import { providerRecoveryScope } from "./scope";
import { storedNativeEvidenceAgrees } from "./stored-proof";
import "server-only";
import type { Prisma, ProviderDispatchIdentity } from "@/lib/generated/prisma/client";
import { decimalQuantity } from "@/lib/metering/mapping";
import { canonical, effective } from "@/lib/metering/store/codec";
import { createTransactionMeter, readPaidOperation } from "@/lib/metering/transaction-meter";
import { recoverRetainedNative } from "@/lib/provider-usage/reconcile-native";
import type { Receipt } from "@usagekit/core";
import { settleHeldRecoveryProof } from "./proof-extension";
import { type RecoveryLookup, verifiedProofValue } from "./proof-value";
import { recoverySwitches } from "./switches";

export async function importRecoveryProof(
  tx: Prisma.TransactionClient,
  identity: ProviderDispatchIdentity,
  operationId: string,
  outcome: RecoveryLookup,
  now: Date,
): Promise<{ accounting: "measured" | "unknown" | "conflict"; reason: string }> {
  if (!recoverySwitches().proofWrites)
    return { accounting: "unknown", reason: "proof_writes_disabled" };
  const scope = providerRecoveryScope();
  const original = await tx.meteringPaidAttemptContext.findUnique({
    where: { namespace_operation_id: { namespace: identity.namespace, operation_id: operationId } },
  });
  if (
    identity.namespace !== scope.namespace ||
    identity.instanceId !== scope.instanceId ||
    !original ||
    original.principal !== identity.principal ||
    !original.fenced_at ||
    !recoveryWriteGateOpen(original)
  )
    return { accounting: "unknown", reason: "write_gate_closed" };
  const context = original.context;
  if (
    !context ||
    typeof context !== "object" ||
    Array.isArray(context) ||
    context.rankCheckId !== identity.rankCheckId ||
    context.projectId !== identity.projectId ||
    context.connectionId !== identity.connectionId ||
    context.keywordId !== identity.keywordId ||
    context.providerCredentialVersion !== identity.providerCredentialVersion
  )
    return { accounting: "conflict", reason: "original_attempt_context_conflict" };
  const proof = verifiedProofValue(identity, outcome);
  if (proof.kind !== "verified") return { accounting: proof.kind, reason: proof.reason };
  if (identity.queuedTaskId) {
    const task = await tx.queuedRankCheckTask.findUnique({ where: { id: identity.queuedTaskId } });
    if (
      (task?.providerTaskId && task.providerTaskId !== proof.body.nativeId) ||
      (task?.costCents !== null &&
        task?.costCents !== undefined &&
        !task.costCents.equals(proof.body.costCents))
    )
      return { accounting: "conflict", reason: "stored_task_evidence_conflict" };
  }
  const operation = await readPaidOperation(await createTransactionMeter(tx, { now: () => now }), {
    namespace: identity.namespace,
    principal: identity.principal,
    operationId,
  });
  if (
    operation.scope.namespace !== identity.namespace ||
    operation.scope.group !== identity.projectId ||
    operation.operation !== identity.feature ||
    operation.source !== identity.requestSource ||
    operation.surface !== identity.requestSurface ||
    operation.scope.connection !== identity.connectionId ||
    operation.provider !== identity.provider ||
    operation.scope.providerCredentialVersion !== identity.providerCredentialVersion ||
    operation.costOwner !== identity.costOwner ||
    operation.scope.principal !== identity.principal ||
    (identity.payerKind === "byok" &&
      (operation.fundingSource !== "byok" || proof.body.accountId !== identity.payerAccountRef)) ||
    (identity.payerKind === "hosted" && operation.fundingSource !== "platform")
  )
    return { accounting: "conflict", reason: "original_proof_binding_conflict" };
  if (!(await storedNativeEvidenceAgrees(tx, identity, operation, proof)))
    return { accounting: "conflict", reason: "stored_native_evidence_conflict" };
  for (const previous of operation.receipts) {
    if (
      (previous.providerRequestId && previous.providerRequestId !== proof.body.nativeId) ||
      (previous.cost.certainty === "measured" &&
        previous.cost.money &&
        previous.cost.money.units !== decimalQuantity(proof.body.costCents, "cents", 4).value)
    )
      return { accounting: "conflict", reason: "stored_native_evidence_conflict" };
  }
  const stored = await tx.providerRecoveryProof.findUnique({ where: { id: proof.id } });
  if (
    stored &&
    (stored.operationPk !== identity.operationPk || stored.evidenceHash !== proof.evidenceHash)
  )
    return { accounting: "conflict", reason: "account_native_evidence_conflict" };
  if (stored) return { accounting: "measured", reason: "proof_already_imported" };
  if (!recoverySwitches().proofWrites)
    return { accounting: "unknown", reason: "proof_writes_disabled" };
  if (operation.state === "settled" || operation.receipts.length > 0 || effective(operation))
    return { accounting: "unknown", reason: "already_settled" };
  if (operation.lease && new Date(operation.lease.expiresAt) > now)
    return { accounting: "unknown", reason: "original_accounting_lease_active" };
  const receipt: Receipt = {
    id: `recovery-proof:${proof.id}`,
    source: "dispatch",
    evidenceRef: proof.evidenceHash,
    providerRequestId: proof.body.nativeId,
    occurredAt: identity.createdAt.toISOString(),
    recordedAt: now.toISOString(),
    cost: {
      certainty: "measured",
      money: { currency: "USD", units: decimalQuantity(proof.body.costCents, "cents", 4).value },
    },
    measurements: [
      {
        unit: "units",
        certainty: "measured",
        quantity: decimalQuantity(proof.body.quantity, "units", 6),
      },
    ],
    failed: proof.body.failed,
    cached: false,
  };
  const reason =
    identity.payerKind === "byok"
      ? (await recoverRetainedNative(tx, operation, receipt, now))
        ? "imported"
        : "native_import_refused"
      : identity.payerKind === "hosted"
        ? await settleHeldRecoveryProof(tx, operation, identity, proof, receipt, now)
        : "funding_source_unavailable";
  if (reason !== "imported")
    return { accounting: reason.includes("conflict") ? "conflict" : "unknown", reason };
  await tx.providerRecoveryProof.create({
    data: {
      id: proof.id,
      operationPk: identity.operationPk,
      namespace: identity.namespace,
      instanceId: identity.instanceId,
      provider: identity.provider,
      accountId: proof.body.accountId,
      nativeId: proof.body.nativeId,
      credentialVersion: identity.providerCredentialVersion,
      evidenceHash: proof.evidenceHash,
      body: JSON.parse(canonical(proof.body)),
      createdAt: now,
    },
  });
  return { accounting: "measured", reason };
}
