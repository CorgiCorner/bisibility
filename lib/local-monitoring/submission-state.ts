import type {
  SubmissionClaim,
  SubmissionEvent,
  SubmissionOutcome,
  SubmissionReconciliation,
  SubmissionRecord,
} from "./execution-types";
import { isoTime, requireToken } from "./key";
import {
  mergeReceipt,
  proofFacts,
  receiptFacts,
  sameSet,
  submissionSettlementReceipt,
} from "./submission-receipts";
import { operationKey } from "./target-key";

export function initialSubmission(input: SubmissionClaim): SubmissionRecord {
  if (operationKey(input.scope) !== input.key) throw new Error("Operation scope/key mismatch");
  for (const value of [
    input.targetKey,
    input.quoteHash,
    input.provider,
    input.adapterVersion,
    input.providerPriceVersion,
  ])
    requireToken(value, "submission reference");
  return {
    ...structuredClone(input),
    version: 0,
    status: "claimed",
    attemptId: null,
    outcome: null,
    settlementRecorded: false,
    cancellationRequested: false,
    collectedEvidenceId: null,
    reconciliationHistory: [],
    pendingReconciliationReason: null,
  };
}

export function assertSubmissionBinding(record: SubmissionRecord, input: SubmissionClaim) {
  if (
    record.key !== input.key ||
    operationKey(record.scope) !== input.key ||
    record.targetKey !== input.targetKey ||
    record.quoteHash !== input.quoteHash ||
    record.provider !== input.provider ||
    record.adapterVersion !== input.adapterVersion ||
    record.providerPriceVersion !== input.providerPriceVersion
  ) {
    throw new Error("Idempotency key already belongs to another immutable submission");
  }
}

export function validateSubmissionOutcome(outcome: SubmissionOutcome) {
  if (!["accepted", "rejected", "unknown"].includes(outcome.acceptance))
    throw new Error("Invalid acceptance state");
  isoTime(outcome.receivedAt);
  outcome.taskIds.forEach((id) => {
    requireToken(id, "provider task");
  });
  if (
    new Set(outcome.taskIds).size !== outcome.taskIds.length ||
    (outcome.acceptance === "accepted" && !outcome.taskIds.length) ||
    (outcome.acceptance === "rejected" && outcome.taskIds.length)
  )
    throw new Error("Invalid acceptance task evidence");
  if (outcome.usage.cached !== false)
    throw new Error("Submission cannot be reported as cache usage");
  for (const amount of [outcome.usage.costCents, outcome.usage.quantity]) {
    if (amount !== null && (!Number.isFinite(amount) || amount < 0))
      throw new Error("Invalid provider usage receipt");
  }
  if (typeof outcome.usage.failed !== "boolean") throw new Error("Invalid provider receipt state");
  if (outcome.usage.providerRequestId !== undefined)
    requireToken(outcome.usage.providerRequestId, "provider request");
}

export function validateSubmissionReconciliation(
  record: SubmissionRecord,
  proof: SubmissionReconciliation,
) {
  if (
    proof.version !== 1 ||
    proof.kind !== "provider_receipt" ||
    proof.attemptId !== record.attemptId ||
    proof.projectId !== record.scope.projectId ||
    proof.operationKey !== record.key ||
    proof.targetKey !== record.targetKey ||
    proof.provider !== record.provider ||
    proof.adapterVersion !== record.adapterVersion ||
    !["desktop", "mobile"].includes(proof.device)
  )
    throw new Error("Reconciliation proof does not belong to original custody");
  requireToken(proof.proofId, "provider proof");
  isoTime(proof.verifiedAt);
  validateSubmissionOutcome(proof.outcome);
  if (
    typeof proof.exhaustive !== "boolean" ||
    (proof.outcome.acceptance !== "unknown" && !proof.exhaustive)
  )
    throw new Error("Exhaustive provider acceptance proof is required");
}
function applyReconciledProof(
  record: SubmissionRecord,
  proof: SubmissionReconciliation,
): SubmissionRecord {
  validateSubmissionReconciliation(record, proof);
  if (!["unknown_acceptance", "accepted", "rejected"].includes(record.status))
    throw new Error("Only original possibly sent work can be reconciled");
  const history = record.reconciliationHistory ?? [];
  const retained = history.find((value) => value.proofId === proof.proofId);
  if (retained) {
    if (proofFacts(retained) !== proofFacts(proof))
      throw new Error("Provider proof identity conflicts with retained evidence");
    return structuredClone(record);
  }
  const knownIds = [
    ...new Set([
      ...(record.outcome?.taskIds ?? []),
      ...history.flatMap((value) => value.outcome.taskIds),
    ]),
  ];
  const knownAcceptance =
    history
      .slice()
      .reverse()
      .find((value) => value.exhaustive && value.outcome.acceptance !== "unknown")?.outcome ??
    (record.outcome?.acceptance !== "unknown" ? record.outcome : null);
  if (
    knownAcceptance &&
    proof.outcome.acceptance !== "unknown" &&
    knownAcceptance.acceptance !== proof.outcome.acceptance
  )
    throw new Error("Provider acceptance proof contradicts established outcome");
  if (
    knownAcceptance?.acceptance === "accepted" &&
    proof.outcome.taskIds.some((id) => !knownAcceptance.taskIds.includes(id))
  )
    throw new Error("Provider proof adds IDs after exhaustive acceptance");
  if (knownAcceptance?.acceptance === "rejected" && proof.outcome.taskIds.length)
    throw new Error("Provider proof contradicts exhaustive rejection");
  if (proof.exhaustive && knownIds.some((id) => !proof.outcome.taskIds.includes(id)))
    throw new Error("Exhaustive proof removes previously accepted task IDs");
  if (
    knownAcceptance?.acceptance === "accepted" &&
    proof.outcome.acceptance === "accepted" &&
    !sameSet(knownAcceptance.taskIds, proof.outcome.taskIds)
  )
    throw new Error("Exhaustive acceptance task set changed");
  const oldReceipt = record.outcome || history.length ? submissionSettlementReceipt(record) : null;
  const receipt = mergeReceipt(oldReceipt, proof.outcome.usage);
  if (knownAcceptance && proof.outcome.acceptance === "unknown" && oldReceipt)
    receipt.failed = oldReceipt.failed;
  if (
    knownAcceptance &&
    proof.outcome.acceptance !== "unknown" &&
    oldReceipt &&
    oldReceipt.failed !== proof.outcome.usage.failed
  )
    throw new Error("Provider proof contradicts established receipt outcome");
  if (history.some((value) => proofFacts(value) === proofFacts(proof)))
    return structuredClone(record);
  if (history.length >= 32)
    throw new Error("Retained proof history requires an explicit retention decision");
  const taskIds = [
    ...knownIds,
    ...proof.outcome.taskIds.filter((id) => !knownIds.includes(id)).sort(),
  ];
  if (taskIds.length > 100) throw new Error("Original task set exceeds bounded retained scope");
  const incompatible =
    record.collectedEvidenceId !== null && !sameSet(record.outcome?.taskIds ?? [], taskIds);
  const acceptance = knownAcceptance?.acceptance ?? proof.outcome.acceptance;
  const nextOutcome = { ...structuredClone(proof.outcome), acceptance, taskIds, usage: receipt };
  const financialChanged =
    oldReceipt === null || receiptFacts(oldReceipt) !== receiptFacts(receipt);
  return {
    ...structuredClone(record),
    version: record.version + 1,
    originalOutcome: history.length ? record.originalOutcome : structuredClone(record.outcome),
    reconciliationHistory: [...structuredClone(history), structuredClone(proof)],
    pendingReconciliationReason: incompatible ? "collected_scope_conflict" : null,
    outcome: incompatible ? structuredClone(record.outcome) : nextOutcome,
    status: incompatible
      ? record.status
      : acceptance === "unknown"
        ? "unknown_acceptance"
        : acceptance,
    settlementRecorded: financialChanged ? false : record.settlementRecorded,
  };
}

export function applySubmissionEvent(
  record: SubmissionRecord,
  event: SubmissionEvent,
): SubmissionRecord {
  if (
    !Number.isSafeInteger(record.version) ||
    record.version < 0 ||
    record.version === Number.MAX_SAFE_INTEGER
  )
    throw new Error("Invalid submission version");
  const next = { ...structuredClone(record), version: record.version + 1 };
  if (event.kind === "cancel") {
    return {
      ...next,
      cancellationRequested: true,
      status: record.status === "claimed" ? "cancelled" : record.status,
    };
  }
  if (event.kind === "possible_send") {
    if (record.status !== "claimed" || record.cancellationRequested || record.attemptId)
      throw new Error("Submission already fenced or cancelled");
    return {
      ...next,
      status: "unknown_acceptance",
      attemptId: requireToken(event.attemptId, "attempt"),
    };
  }
  if (!record.attemptId || event.attemptId !== record.attemptId)
    throw new Error("Submission attempt mismatch");
  if (event.kind === "reconciled") return applyReconciledProof(record, event.proof);
  if (event.kind === "outcome") {
    validateSubmissionOutcome(event.outcome);
    if (record.status !== "unknown_acceptance" || record.outcome)
      throw new Error("Acceptance evidence is already retained");
    const status =
      event.outcome.acceptance === "unknown" ? "unknown_acceptance" : event.outcome.acceptance;
    return { ...next, status, outcome: structuredClone(event.outcome) };
  }
  if (event.kind === "settlement") {
    if (!record.outcome || !["accepted", "rejected", "unknown_acceptance"].includes(record.status))
      throw new Error("No retained receipt to settle");
    return { ...next, settlementRecorded: true };
  }
  if (
    !["accepted", "unknown_acceptance"].includes(record.status) ||
    !record.outcome?.taskIds.length ||
    !record.settlementRecorded
  )
    throw new Error("Settled accepted task IDs required for observation persistence");
  const evidenceId = requireToken(event.evidenceId, "evidence");
  if (record.collectedEvidenceId && record.collectedEvidenceId !== evidenceId)
    throw new Error("Operation already has another observation");
  return { ...next, collectedEvidenceId: evidenceId };
}

export { submissionSettlementReceipt } from "./submission-receipts";
