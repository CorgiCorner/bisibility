import type { ProviderUsageObserver, ProviderUsageReceipt } from "@/lib/providers/usage";
import type { PricedRequest, ProviderRequest } from "@usagekit/providers";
import type { LocalCapability } from "./capability";
import type { LocalQuote } from "./quote";
import type { ExecutionTargetV1, OperationScope, PointRevision } from "./types";

export type LocalJournalPort = Required<
  Pick<ProviderUsageObserver, "prepare" | "beforeDispatch" | "settle">
>;
export type SubmissionOutcome = Readonly<{
  /** accepted is exhaustive; unknown may retain a proven accepted subset, never invented IDs. */
  acceptance: "accepted" | "rejected" | "unknown";
  taskIds: readonly string[];
  receivedAt: string;
  usage: ProviderUsageReceipt;
}>;
export type SubmissionReconciliation = Readonly<{
  version: 1;
  kind: "provider_receipt";
  proofId: string;
  attemptId: string;
  projectId: string;
  operationKey: string;
  targetKey: string;
  provider: string;
  adapterVersion: string;
  device: "desktop" | "mobile";
  verifiedAt: string;
  /** Only verified exhaustive evidence may establish accepted/rejected. */
  exhaustive: boolean;
  outcome: SubmissionOutcome;
}>;
export type ReconciliationPendingReason = "collected_scope_conflict";
export type SubmissionRecord = Readonly<{
  key: string;
  version: number;
  scope: OperationScope;
  targetKey: string;
  quoteHash: string;
  provider: string;
  adapterVersion: string;
  providerPriceVersion: string;
  status: "claimed" | "unknown_acceptance" | "accepted" | "rejected" | "cancelled";
  attemptId: string | null;
  outcome: SubmissionOutcome | null;
  settlementRecorded: boolean;
  cancellationRequested: boolean;
  collectedEvidenceId: string | null;
  /** Optional for pre-expansion rows; retained transport proof is not a financial authority. */
  originalOutcome?: SubmissionOutcome | null;
  reconciliationHistory?: readonly SubmissionReconciliation[];
  pendingReconciliationReason?: ReconciliationPendingReason | null;
}>;
export type SubmissionEvent =
  | { kind: "possible_send"; attemptId: string }
  | { kind: "outcome"; attemptId: string; outcome: SubmissionOutcome }
  | { kind: "reconciled"; attemptId: string; proof: SubmissionReconciliation }
  | { kind: "settlement"; attemptId: string }
  | { kind: "cancel" }
  | { kind: "collected"; attemptId: string; evidenceId: string };
export type SubmissionClaim = Omit<
  SubmissionRecord,
  | "version"
  | "status"
  | "attemptId"
  | "outcome"
  | "settlementRecorded"
  | "cancellationRequested"
  | "collectedEvidenceId"
  | "originalOutcome"
  | "reconciliationHistory"
  | "pendingReconciliationReason"
>;

export interface LocalOperationStore {
  read(key: string): Promise<SubmissionRecord | null>;
  /** Atomic immutable binding + one active/unknown target owner across caller keys. Only fresh may send. */
  claim(input: SubmissionClaim): Promise<{ fresh: boolean; record: SubmissionRecord }>;
  /** Transactional CAS. Cancellation must never discard accepted task IDs or accounting evidence. */
  apply(key: string, expectedVersion: number, event: SubmissionEvent): Promise<SubmissionRecord>;
}
export interface LocalSubmitCollectAdapter {
  capability: LocalCapability;
  providerPriceVersion: string;
  buildRequest(input: {
    target: ExecutionTargetV1;
    point: PointRevision;
    quote: LocalQuote;
  }): ProviderRequest;
  /** Host price authority checks the current Meter-priced request against the accepted quote. */
  assertPreparedQuote(request: PricedRequest, quote: LocalQuote): Promise<void>;
  submit(request: PricedRequest): Promise<SubmissionOutcome>;
  /** Host delegates custody/correlation checks to current ownAdmission.assertRetrieval. */
  assertRetrieval(record: SubmissionRecord): Promise<void>;
  /** Retrieval only: never enqueue, submit, refresh by purchase, or replace accepted task IDs. */
  collect(taskIds: readonly string[]): Promise<CollectedLocalResult>;
}
export type CollectedLocalResult = Readonly<{
  taskIds: readonly string[];
  observedAt: string | null;
  payload: unknown;
  completeness: "complete" | "truncated" | "unknown";
  completeThrough: number | null;
}>;
export interface LocalEvidencePort {
  /** Writes existing normalized ObservationRun/items, idempotently by operation; never a second kernel. */
  persist(input: {
    record: SubmissionRecord;
    result: CollectedLocalResult;
  }): Promise<{ evidenceId: string }>;
}
export class LocalOperationConflict extends Error {
  constructor() {
    super("Local operation version changed");
    this.name = "LocalOperationConflict";
  }
}
export class LocalTargetBlocked extends Error {
  constructor(readonly blockingOperationKey: string) {
    super("Target has retained active or unknown work; reconcile before repurchase");
    this.name = "LocalTargetBlocked";
  }
}
