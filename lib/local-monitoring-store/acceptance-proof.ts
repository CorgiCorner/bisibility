import "server-only";
import type {
  SubmissionReconciliation,
  SubmissionRecord,
} from "@/lib/local-monitoring/execution-types";
import { validateSubmissionReconciliation } from "@/lib/local-monitoring/submission-state";
import type { ExecutionTargetV1 } from "@/lib/local-monitoring/types";
import { createTransactionMeter, readPaidOperation } from "@/lib/metering/transaction-meter";
import { ownTransportRef } from "@/lib/metering/transport-own-admission";
import type { LocalTransaction } from "./context";
import type { LocalItemCustody } from "./custody";
import { submissionReconciliationSchema } from "./schema";

export type OriginalLocalProofBinding = Readonly<
  LocalItemCustody & {
    attemptId: string;
    operationKey: string;
    targetKey: string;
    adapterVersion: string;
    device: "desktop" | "mobile";
  }
>;
/** Host verifies original submit receipt/proven exhaustive acceptance. GET cost0 is not submit proof.
 * No default implementation, client-supplied receipt, paid submit, prepare or restart grant exists. */
export interface LocalAcceptanceProofPort {
  loadVerifiedOriginalProof(binding: OriginalLocalProofBinding): Promise<SubmissionReconciliation>;
}
export function verifyLocalAcceptanceProof(
  record: SubmissionRecord,
  target: ExecutionTargetV1,
  value: unknown,
) {
  const proof = submissionReconciliationSchema.parse(value);
  validateSubmissionReconciliation(record, proof);
  if (proof.device !== target.device)
    throw new Error("Provider proof belongs to another execution device.");
  return proof;
}

export async function localCanonicalFinancialState(tx: LocalTransaction, id: string) {
  const operation = await readPaidOperation(
    await createTransactionMeter(tx),
    await ownTransportRef(tx, id),
  );
  return operation.state;
}
export async function terminalLocalProofReplay(
  tx: LocalTransaction,
  id: string,
  record: SubmissionRecord,
) {
  const terminal =
    !record.pendingReconciliationReason &&
    record.settlementRecorded &&
    (record.status === "rejected" ||
      (record.status === "accepted" && record.collectedEvidenceId !== null));
  return terminal && (await localCanonicalFinancialState(tx, id)) === "settled";
}
