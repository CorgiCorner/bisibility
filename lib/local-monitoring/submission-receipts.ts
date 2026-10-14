import type { ProviderUsageReceipt } from "@/lib/providers/usage";
import type { SubmissionReconciliation, SubmissionRecord } from "./execution-types";

export function sameSet(a: readonly string[], b: readonly string[]) {
  const left = [...a].sort();
  const right = [...b].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function mergeReceipt(
  previous: ProviderUsageReceipt | null,
  next: ProviderUsageReceipt,
): ProviderUsageReceipt {
  if (!previous) return structuredClone(next);
  for (const field of ["costCents", "quantity"] as const) {
    if (previous[field] !== null && next[field] !== null && previous[field] !== next[field])
      throw new Error("Reconciliation contradicts known native measurement");
  }
  if (
    previous.providerRequestId &&
    next.providerRequestId &&
    previous.providerRequestId !== next.providerRequestId
  )
    throw new Error("Reconciliation changes original native request identity");
  const providerRequestId = next.providerRequestId ?? previous.providerRequestId;
  return {
    ...next,
    costCents: previous.costCents ?? next.costCents,
    quantity: previous.quantity ?? next.quantity,
    ...(providerRequestId ? { providerRequestId } : {}),
  };
}

/** Select retained native facts for canonical correction, never a computed local charge. */
export function submissionSettlementReceipt(record: SubmissionRecord): ProviderUsageReceipt {
  const original = record.originalOutcome === undefined ? record.outcome : record.originalOutcome;
  let receipt = original?.usage ?? null;
  let knownFailure = original !== null && original?.acceptance !== "unknown";
  for (const proof of record.reconciliationHistory ?? []) {
    const previous = receipt;
    receipt = mergeReceipt(receipt, proof.outcome.usage);
    if (knownFailure && proof.outcome.acceptance === "unknown" && previous)
      receipt.failed = previous.failed;
    if (proof.exhaustive && proof.outcome.acceptance !== "unknown") knownFailure = true;
  }
  if (!receipt) throw new Error("No retained native receipt to settle");
  return structuredClone(receipt);
}

export function receiptFacts(receipt: ProviderUsageReceipt) {
  return JSON.stringify([
    receipt.cached,
    receipt.costCents,
    receipt.quantity,
    receipt.failed,
    receipt.providerRequestId ?? null,
  ]);
}

export function proofFacts(proof: SubmissionReconciliation) {
  return JSON.stringify([
    proof.version,
    proof.kind,
    proof.attemptId,
    proof.projectId,
    proof.operationKey,
    proof.targetKey,
    proof.provider,
    proof.adapterVersion,
    proof.device,
    proof.exhaustive,
    proof.outcome.acceptance,
    [...proof.outcome.taskIds].sort(),
    receiptFacts(proof.outcome.usage),
  ]);
}
