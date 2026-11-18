import type { ModelColumn, ModelColumnResult } from "@/lib/model-playground/types";
import type { ModelTransportErrorCode } from "./errors";

export type ModelNormalizedResponse = Pick<
  ModelColumnResult,
  | "actualProviderId"
  | "actualModelId"
  | "resolvedWorkspaceId"
  | "routingViolation"
  | "state"
  | "failure"
  | "answer"
  | "truncation"
  | "citations"
  | "consultedSources"
  | "citationTotals"
  | "costEvidence"
  | "routingAttemptCredentials"
  | "usage"
  | "providerCost"
  | "paymentReceipt"
  | "rawEvidenceId"
>;

export function transportEvidence(
  column: ModelColumn,
  startedAt: number,
  requestId: string | null,
): ModelColumnResult {
  const finishedAt = Math.max(startedAt, Date.now());
  return {
    version: 1,
    column,
    actualProviderId: null,
    actualModelId: null,
    providerRequestId: requestId,
    state: "unknown",
    failure: "accounting_unknown",
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - startedAt,
    answer: null,
    truncation: { provider: false, application: false, citations: false },
    citations: [],
    usage: {
      completeness: "unknown",
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      cacheReadInputTokens: null,
      cacheWriteInputTokens: null,
      inputCacheAccounting: "unknown",
      cacheWrites: [],
      searchCalls: null,
      searchContentTokens: null,
    },
    providerCost: {
      amount: null,
      currency: "USD",
      certainty: "unknown",
      basis: "unknown",
      rateCardVersion: null,
    },
    paymentReceipt: null,
    rawEvidenceId: null,
  };
}

export function transportFailure(code: ModelTransportErrorCode): ModelColumnResult["failure"] {
  switch (code) {
    case "invalid_credentials":
    case "refused":
    case "rate_limited":
    case "invalid_response":
    case "timeout":
    case "accounting_unknown":
      return code;
    case "aborted":
      return "accounting_unknown";
    default:
      return "provider_error";
  }
}
