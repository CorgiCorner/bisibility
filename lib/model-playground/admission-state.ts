import { MODEL_TRANSPORT_LIMITS } from "@/lib/providers/model/transport-input";

export const MODEL_ADMISSION_WINDOW_MS = 600_000;
// One bounded accounting transaction may commit after the transport deadline.
export const MODEL_EVIDENCE_COMMIT_MARGIN_MS = 30_000;
export const MODEL_IN_FLIGHT_MS =
  MODEL_TRANSPORT_LIMITS.timeoutMs + MODEL_EVIDENCE_COMMIT_MARGIN_MS;

export type ModelAttemptState =
  | "admitted"
  | "in_flight"
  | "stale_unknown"
  | "observed"
  | "refused"
  | "acknowledged_unknown";
export type ModelAttemptLifecycle = {
  dispatchedAt: Date | null;
  observedAt: Date | null;
  acknowledgedAt: Date | null;
  refusalReason: string | null;
  reservationExpiresAt: Date | null;
  reservationState: string;
};

/** Observation and acknowledgement never remove the durable possible-send fence. */
export function modelAttemptState(a: ModelAttemptLifecycle, now: Date): ModelAttemptState {
  if (a.observedAt) return "observed";
  if (a.acknowledgedAt) return "acknowledged_unknown";
  if (a.dispatchedAt)
    return a.dispatchedAt.getTime() + MODEL_IN_FLIGHT_MS > now.getTime()
      ? "in_flight"
      : "stale_unknown";
  return a.refusalReason ? "refused" : "admitted";
}

export function modelAttemptHoldsSlot(a: ModelAttemptLifecycle, now: Date) {
  return modelAttemptState(a, now) === "in_flight";
}

export function modelRootIsLive(acceptedAt: Date, attempts: ModelAttemptLifecycle[], now: Date) {
  return (
    acceptedAt.getTime() + MODEL_ADMISSION_WINDOW_MS > now.getTime() ||
    attempts.some(
      (a) =>
        modelAttemptHoldsSlot(a, now) ||
        (modelAttemptState(a, now) === "admitted" &&
          a.reservationState === "reserved" &&
          a.reservationExpiresAt !== null &&
          a.reservationExpiresAt > now),
    )
  );
}
