import "server-only";
import { DataForSeoError } from "@/lib/providers/serp/dataforseo-errors";
import {
  DataForSeoAmbiguousSubmissionError,
  type DataForSeoQueuedSubmissionResult,
} from "@/lib/providers/serp/dataforseo-queued";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { providerUsageFailureDetails } from "@/lib/providers/usage-failure-details";

export type QueuedSubmissionPhase = "not_sent" | "rejected" | "unknown" | "responded";

export type QueuedSubmissionDiagnostic = {
  batchId: string;
  connectionId: string | null;
  phase: QueuedSubmissionPhase;
  httpStatus: number | null;
  dataforseoStatusCode: number | null;
  /** Redacted by the provider adapter and bounded to 200 characters. */
  dataforseoStatusMessage: string | null;
  /** Error class only; error text can carry request data and is never logged here. */
  errorName: string | null;
  usageFailure?: ReturnType<typeof providerUsageFailureDetails>;
};

export const QUEUED_SUBMISSION_LOG_MESSAGE = "[queued-rank-check] submission not confirmed";

type Warn = (message: string, details: Record<string, unknown>) => void;

/**
 * Safe fields for a submission that became ambiguous or failed. Only provider status fields that
 * the adapter already redacted are copied; credentials, headers, keywords and domains never are.
 */
export function queuedSubmissionDiagnostic(
  batchId: string,
  connectionId: string | null,
  phase: QueuedSubmissionPhase,
  error?: unknown,
): QueuedSubmissionDiagnostic {
  const provider = error instanceof DataForSeoError ? error : null;
  const httpStatus =
    error instanceof DataForSeoError || error instanceof DataForSeoAmbiguousSubmissionError
      ? (error.httpStatus ?? null)
      : null;
  return {
    batchId,
    connectionId,
    phase,
    httpStatus,
    dataforseoStatusCode: provider?.statusCode ?? null,
    dataforseoStatusMessage: provider?.statusMessage ?? null,
    errorName: error instanceof Error ? error.name : null,
    ...(error instanceof ProviderUsagePersistenceError
      ? { usageFailure: providerUsageFailureDetails(error) }
      : {}),
  };
}

export function logQueuedSubmissionDiagnostic(
  outcome: "ambiguous" | "failed" | "partial",
  diagnostic: QueuedSubmissionDiagnostic,
  warn: Warn = console.warn,
) {
  warn(QUEUED_SUBMISSION_LOG_MESSAGE, { outcome, ...diagnostic });
}

/** One line when DataForSEO answered but some tasks were rejected or left unaccounted for. */
export function logPartialQueuedSubmission(
  input: { batchId: string; connectionId: string | null },
  result: DataForSeoQueuedSubmissionResult,
  warn: Warn = console.warn,
) {
  if (result.failed.length === 0 && result.unknown.length === 0) return;
  warn(QUEUED_SUBMISSION_LOG_MESSAGE, {
    outcome: "partial",
    batchId: input.batchId,
    connectionId: input.connectionId,
    phase: "responded",
    httpStatus: null,
    dataforseoStatusCode: result.envelope?.statusCode ?? null,
    dataforseoStatusMessage: result.envelope?.statusMessage ?? null,
    errorName: null,
    acceptedTasks: result.accepted.length,
    failedTasks: result.failed.length,
    unknownTasks: result.unknown.length,
  });
}
