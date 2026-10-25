import type { ProviderDispatchIdentity } from "@/lib/generated/prisma/client";
import type { LookupFailure, Retry } from "./outcomes";
import type { RetainedSubmission } from "./submission";

export type HistoryScope = { provider: string; feature: string; submittedEndpointPath: string };
export type RecoveryAccount = Readonly<{
  accountId: string;
  credentialVersion: string;
  [key: string]: unknown;
}>;
export type HistoryTask = {
  id: string;
  endpointPath: string | null;
  tag: string | null;
  function: string | null;
  datetimePosted: string | null;
  datetimeDone: string | null;
  costCents: number | null;
  metadata: Record<string, unknown> | null;
};
export type HistoryPage = {
  kind: "page" | "empty_page";
  tasks: HistoryTask[];
  nextOffset: number | null;
  acceptance: "unknown";
  costCents: null;
  retryable: false;
  suggestedBackoffMs: null;
};
export type HistoryInput = HistoryScope & {
  from: string;
  to: string;
  offset?: number;
  limit?: number;
};

export type TaskClassification =
  | "success"
  | "terminal_empty_success"
  | "partial"
  | "provider_error"
  | "pending"
  | "unknown_code"
  | "absent"
  | "outage"
  | "rate_limited";

export type RecoveryTask = Retry & {
  id: string | null;
  status: { code: number | null; message: string | null };
  classification: TaskClassification;
  costCents: number | null;
  submittedPayload: Record<string, unknown> | null;
  results: Record<string, unknown>[];
  organicItems: Record<string, unknown>[];
  returnedDepth: number | null;
};

export type IdListQuery = {
  datetime_from: string;
  datetime_to: string;
  include_metadata: true;
  limit: number;
  offset: number;
  sort: "asc";
};
export type HistoryResponse = { kind: "response"; body: unknown } | LookupFailure;
export type HistoryTransport = {
  listIds: (query: IdListQuery) => Promise<HistoryResponse>;
  getTask: (id: string) => Promise<HistoryResponse>;
};
export type RecoveryGet =
  | LookupFailure
  | (Retry & {
      kind: "evidence";
      topStatus: { code: number | null; message: string | null };
      classification: string;
      tasks: RecoveryTask[];
      acceptance: "unknown";
      costCents: null;
    });
export interface ProviderRecoveryAdapter {
  readonly provider: string;
  capability(
    scope: HistoryScope,
  ):
    | { kind: "supported"; capability: { idListPath: string; taskGetPath: string | null } }
    | LookupFailure;
  resolveAccount(identity: ProviderDispatchIdentity): Promise<RecoveryAccount | null>;
  createTransport(account: RecoveryAccount): HistoryTransport;
  listHistory(
    transport: HistoryTransport,
    input: HistoryInput,
    now: Date,
  ): AsyncGenerator<HistoryPage | LookupFailure>;
  getTask(
    transport: HistoryTransport,
    input: HistoryScope & { id: string; submittedAt: string },
    now: Date,
  ): Promise<RecoveryGet>;
  matchTask(
    tag: string,
    retained: RetainedSubmission | null,
    candidates: readonly HistoryTask[],
  ):
    | { kind: "match"; task: HistoryTask }
    | { kind: "no_match" | "ambiguous" | "missing_retained_payload" };
  retention(identity: ProviderDispatchIdentity, now: Date): LookupFailure | null;
}
