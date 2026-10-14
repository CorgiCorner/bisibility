import type {
  LocalEvidencePort,
  LocalJournalPort,
  LocalOperationStore,
  LocalSubmitCollectAdapter,
  SubmissionReconciliation,
} from "./execution-types";
import { isoTime, requireToken } from "./key";
import { persistSubmissionEvent } from "./submission-events";
import { submissionSettlementReceipt } from "./submission-state";

export async function resumeLocalSettlement(input: {
  key: string;
  store: LocalOperationStore;
  journal: LocalJournalPort;
}) {
  const record = await input.store.read(input.key);
  if (!record?.attemptId || !record.outcome)
    throw new Error("No durable submission outcome to reconcile");
  if (record.settlementRecorded) return record;
  await input.journal.settle(record.attemptId, submissionSettlementReceipt(record));
  return persistSubmissionEvent(input.store, record, {
    kind: "settlement",
    attemptId: record.attemptId,
  });
}

export async function collectLocalTarget(input: {
  key: string;
  store: LocalOperationStore;
  adapter: Pick<LocalSubmitCollectAdapter, "collect" | "capability" | "assertRetrieval">;
  evidence: LocalEvidencePort;
}) {
  const record = await input.store.read(input.key);
  if (
    !record?.attemptId ||
    !record.settlementRecorded ||
    !record.outcome?.taskIds.length ||
    !["accepted", "unknown_acceptance"].includes(record.status)
  )
    throw new Error("No settled accepted task IDs to collect");
  if (
    record.provider !== input.adapter.capability.provider ||
    record.adapterVersion !== input.adapter.capability.adapterVersion
  )
    throw new Error("Accepted task adapter changed");
  if (record.collectedEvidenceId) return { evidenceId: record.collectedEvidenceId, replayed: true };
  await input.adapter.assertRetrieval(record);
  // Accepted work outlives quote/cache expiry and cancellation; this path never submits.
  const result = await input.adapter.collect([...record.outcome.taskIds]);
  const expected = [...record.outcome.taskIds].sort();
  const returned = [...result.taskIds].sort();
  if (expected.length !== returned.length || expected.some((id, index) => id !== returned[index]))
    throw new Error("Collected provider task IDs do not match acceptance evidence");
  if (result.observedAt !== null) isoTime(result.observedAt);
  if (
    !["complete", "truncated", "unknown"].includes(result.completeness) ||
    (result.completeThrough !== null &&
      (!Number.isSafeInteger(result.completeThrough) || result.completeThrough < 0))
  )
    throw new Error("Invalid collected completeness evidence");
  // A partially unknown batch never becomes complete just because its known task IDs returned.
  const retainedResult =
    record.status === "unknown_acceptance"
      ? { ...result, completeness: "unknown" as const, completeThrough: null }
      : result;
  const persisted = await input.evidence.persist({ record, result: retainedResult });
  requireToken(persisted.evidenceId, "observation");
  await persistSubmissionEvent(input.store, record, {
    kind: "collected",
    attemptId: record.attemptId,
    evidenceId: persisted.evidenceId,
  });
  return { evidenceId: persisted.evidenceId, replayed: false };
}

export async function cancelLocalTarget(key: string, store: LocalOperationStore) {
  const record = await store.read(key);
  if (!record) throw new Error("Local operation not found");
  return persistSubmissionEvent(store, record, { kind: "cancel" });
}

/** Trusted original receipt only. This port has no prepare, submit or dispatch capability. */
export async function reconcileLocalAcceptance(input: {
  key: string;
  proof: SubmissionReconciliation;
  store: LocalOperationStore;
  accounting: Pick<LocalJournalPort, "settle">;
}) {
  const record = await input.store.read(input.key);
  if (!record?.attemptId) throw new Error("Original possibly sent attempt is required");
  let retained = await persistSubmissionEvent(input.store, record, {
    kind: "reconciled",
    attemptId: record.attemptId,
    proof: input.proof,
  });
  if (!retained.settlementRecorded) {
    await input.accounting.settle(record.attemptId, submissionSettlementReceipt(retained));
    retained = await persistSubmissionEvent(input.store, retained, {
      kind: "settlement",
      attemptId: record.attemptId,
    });
  }
  return retained;
}
