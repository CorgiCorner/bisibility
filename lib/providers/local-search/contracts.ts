import type { LocalCapability } from "@/lib/local-monitoring/capability";
import type {
  LocalSubmitCollectAdapter,
  SubmissionOutcome,
  SubmissionRecord,
} from "@/lib/local-monitoring/execution-types";
import type { LocalQuote } from "@/lib/local-monitoring/quote";
import type { ExecutionTargetV1, PointRevision } from "@/lib/local-monitoring/types";
import type { LocalObservationRunInput } from "@/lib/observation/types";
import type { PricedRequest, ProviderRequest } from "@usagekit/providers";

export const LOCAL_ADAPTER_VERSION = "dataforseo-local-task-v1";
export const LOCAL_CAPABILITY_VERSION = "dataforseo-local-docs-v1";
export type LocalProviderSurface = "maps" | "local_finder";
export type LocalProviderBinding = Readonly<{
  target: ExecutionTargetV1;
  point: PointRevision;
  keyword: Readonly<{ id: string; revision: string; text: string }>;
  requestedAt: string | null;
}>;
export type IdentityIssue = Readonly<{
  taskId: string;
  resultOrdinal: number;
  sourceOrdinal: number;
  field: "cid" | "place_id";
  reason: "invalid_identifier" | "unsafe_numeric_identifier";
}>;
export type ParsedLocalPayload = Readonly<{
  version: 1;
  provider: "dataforseo";
  adapterVersion: typeof LOCAL_ADAPTER_VERSION;
  runs: readonly LocalObservationRunInput[];
  /** Any issue blocks identity confirmation; never rescue it by name/domain. */
  identityIssues: readonly IdentityIssue[];
  unsupportedItemCount: number;
}>;
export type LocalSubmissionOutcome = SubmissionOutcome &
  Readonly<{
    taskCharges: readonly Readonly<{
      taskId: string | null;
      statusCode: number | null;
      costUsd: number | null;
    }>[];
    envelopeCostUsd: number | null;
    dispatchEvidenceVerified: boolean;
  }>;
export type DocumentedLocalAdapter = Omit<LocalSubmitCollectAdapter, "submit"> & {
  submit(request: PricedRequest): Promise<LocalSubmissionOutcome>;
};

/** No credentials, fetch implementation, ledger, or automatic retries in this layer. */
export interface LocalProviderPorts<DispatchEvidence> {
  /** One existing prepared dispatch only; retain its actual durable evidence before returning. */
  submitPrepared(
    request: PricedRequest,
  ): Promise<{ data: unknown; ok: boolean; dispatchEvidence: DispatchEvidence }>;
  assertDurableDispatchEvidence(evidence: DispatchEvidence, request: PricedRequest): Promise<void>;
  /** Bind to existing authenticated requestEnvelope GET only, after custody checks. */
  retrieveEnvelope(url: string): Promise<unknown>;
  /** Delegate to current ownAdmission.assertRetrieval and retained settled receipt correlation. */
  assertRetrieval(record: SubmissionRecord): Promise<void>;
  assertPreparedBinding(request: PricedRequest, expected: ProviderRequest): Promise<void>;
  assertPreparedQuote(request: PricedRequest, quote: LocalQuote): Promise<void>;
  clock(): Date;
}

/** Unregistered and expired by design. Docs are not product capability acceptance. */
export const disabledLocalCapability: LocalCapability = Object.freeze({
  version: LOCAL_CAPABILITY_VERSION,
  provider: "dataforseo",
  adapterVersion: LOCAL_ADAPTER_VERSION,
  expiresAt: "1970-01-01T00:00:00.000Z",
  nativeBillingUnit: "cents",
  implementations: Object.freeze([]),
});
