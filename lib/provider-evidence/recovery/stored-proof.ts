import type { Prisma, ProviderDispatchIdentity } from "@/lib/generated/prisma/client";
import { decimalQuantity } from "@/lib/metering/mapping";
import { readNativeProof } from "@/lib/metering/transport-proof-extension";
import type { Operation } from "@usagekit/core";
import type { VerifiedRecoveryProof } from "./proof-value";

/** A journal/proof may survive a failed canonical settlement; compare it before filling cost. */
export async function storedNativeEvidenceAgrees(
  tx: Prisma.TransactionClient,
  identity: ProviderDispatchIdentity,
  operation: Operation,
  proof: VerifiedRecoveryProof,
) {
  const journal = await tx.meteringUsageEvidence.findUnique({
    where: { id: operation.operationId },
  });
  if (!journal) return true;
  if (
    journal.namespace !== identity.namespace ||
    journal.principal !== identity.principal ||
    journal.projectId !== identity.projectId ||
    journal.connectionId !== identity.connectionId ||
    journal.provider !== identity.provider ||
    (journal.providerRequestId && journal.providerRequestId !== proof.body.nativeId) ||
    journal.discarded ||
    journal.canonicalId
  )
    return false;
  const estimate = journal.estimate;
  if (
    estimate &&
    typeof estimate === "object" &&
    !Array.isArray(estimate) &&
    typeof estimate.credentialVersion === "string" &&
    estimate.credentialVersion !== identity.providerCredentialVersion
  )
    return false;
  const observation = journal.receipt;
  if (observation && typeof observation === "object" && !Array.isArray(observation)) {
    if (
      observation.costCents !== null &&
      observation.costCents !== undefined &&
      decimalQuantity(String(observation.costCents), "cents", 4).value !==
        decimalQuantity(proof.body.costCents, "cents", 4).value
    )
      return false;
    if (
      observation.quantity !== null &&
      observation.quantity !== undefined &&
      decimalQuantity(String(observation.quantity), "units", 6).value !==
        decimalQuantity(proof.body.quantity, "units", 6).value
    )
      return false;
    if (observation.cached === true) return false;
  }
  const native = journal.receiptId ? await readNativeProof(tx, operation, journal.receiptId) : null;
  if (
    native &&
    ((native.providerRequestId && native.providerRequestId !== proof.body.nativeId) ||
      native.cached ||
      (native.cost.certainty === "measured" &&
        native.cost.money &&
        native.cost.money.units !== decimalQuantity(proof.body.costCents, "cents", 4).value))
  )
    return false;
  if (
    native?.measurements.some(
      (m) =>
        m.unit === "units" &&
        m.certainty === "measured" &&
        (!m.quantity || m.quantity.value * 1000000n !== 1000000n * 10n ** BigInt(m.quantity.scale)),
    )
  )
    return false;
  return true;
}
