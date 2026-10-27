import { ApplicationFailure } from "@temporalio/common";
import { DeliveryHttpError } from "../alerts/delivery-http-error";
import { PRIVATE_NETWORK_WEBHOOK_ERROR } from "../alerts/webhook-target";
import { EmailBudgetExceededError, EmailSendError } from "../email/types";

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

export function classifyDeliveryFailure(
  error: unknown,
  channel: "email" | "slack" | "webhook",
  message = deliveryFailureMessage(error),
) {
  const email = channel === "email";
  if (email && error instanceof EmailBudgetExceededError)
    return nonRetryableFailure(message, "email_budget_exceeded");
  if (email && !(error instanceof EmailSendError)) return error;
  const transportError =
    (email && error instanceof EmailSendError) || (!email && error instanceof DeliveryHttpError)
      ? error
      : null;
  if (transportError && transportError.status === 429)
    return rateLimitedFailure(message, transportError.retryAfterSeconds);
  if (error instanceof ApplicationFailure && error.nonRetryable) return error;
  const transportStatus = transportError?.status;
  const status = transportStatus === undefined ? statusFromMessage(message) : transportStatus;
  const permanentMessage =
    channel === "slack"
      ? message.startsWith("Slack alert send failed:")
      : channel === "webhook" && message.includes(PRIVATE_NETWORK_WEBHOOK_ERROR);
  if (error instanceof ApplicationFailure || permanentMessage || permanentHttpStatus(status)) {
    return nonRetryableFailure(
      message,
      error instanceof ApplicationFailure ? (error.type ?? undefined) : undefined,
    );
  }
  return error;
}

export function deliveryStateForOutcomes<T extends "delivered" | "digested">(
  outcomes: DeliveryOutcome[],
  deliveredState: T,
): T | "dead_letter" | "skipped" {
  if (outcomes.some((outcome) => outcome.delivered)) return deliveredState;
  return outcomes.some((outcome) => !outcome.skipped) ? "dead_letter" : "skipped";
}
