import { ApplicationFailure } from "@temporalio/common";

type DeliveryOutcome = { delivered: boolean; skipped?: boolean };

export function deliveryFailureMessage(error: unknown, fallback = "Alert delivery failed.") {
  return error instanceof Error ? error.message : fallback;
}

export function statusFromMessage(value: string) {
  const match = /status (\d{3})\./.exec(value);
  return match ? Number(match[1]) : null;
}

export function permanentHttpStatus(status: number | null) {
  return status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

export function nonRetryableFailure(message: string, type?: string) {
  return ApplicationFailure.create({ message, nonRetryable: true, type });
}

export function rateLimitedFailure(message: string, retryAfterSeconds: number | null) {
  const requestedDelay =
    retryAfterSeconds !== null && retryAfterSeconds > 0 ? retryAfterSeconds : 60;
  return ApplicationFailure.create({
    message,
    nextRetryDelay: `${Math.min(requestedDelay, 600)} seconds`,
    type: "rate_limited",
  });
}

export function classifyPermanentDeliveryFailure(
  error: unknown,
  options: { message: string; permanentMessage?: boolean; status?: number | null },
) {
  if (error instanceof ApplicationFailure && error.nonRetryable) return error;
  const status = options.status === undefined ? statusFromMessage(options.message) : options.status;
  if (
    error instanceof ApplicationFailure ||
    options.permanentMessage ||
    permanentHttpStatus(status)
  ) {
    return nonRetryableFailure(
      options.message,
      error instanceof ApplicationFailure ? (error.type ?? undefined) : undefined,
    );
  }
  return null;
}

export function deliveryStateForOutcomes<T extends "delivered" | "digested">(
  outcomes: DeliveryOutcome[],
  deliveredState: T,
): T | "dead_letter" | "skipped" {
  if (outcomes.some((outcome) => outcome.delivered)) return deliveredState;
  return outcomes.some((outcome) => !outcome.skipped) ? "dead_letter" : "skipped";
}
