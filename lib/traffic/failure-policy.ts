import type { ProviderFailureClass } from "@/lib/providers/failure-class";

const USER_ACTIONABLE_FAILURES = new Set<ProviderFailureClass>(["auth", "config_invalid"]);
const TRANSIENT_FAILURES = new Set<ProviderFailureClass>(["network", "provider_5xx", "unknown"]);

export const TRAFFIC_FAILURE_STREAK_THRESHOLD = 3;
export const TRAFFIC_PROVIDER_FAILURE_SHARE_THRESHOLD = 0.25;

export type TrafficReauthReason = "permission" | "scope";
export type TrafficFailureDiagnostic = {
  googleCode?: string;
  googleReason?: string;
  httpStatus?: number;
};

export type TrafficFailureRun = {
  errorClass: string | null;
  status: string;
};

export function isUserActionableTrafficFailure(
  errorClass: ProviderFailureClass | null | undefined,
) {
  return Boolean(errorClass && USER_ACTIONABLE_FAILURES.has(errorClass));
}

export function isTransientTrafficFailure(errorClass: string | null | undefined) {
  return Boolean(errorClass && TRANSIENT_FAILURES.has(errorClass as ProviderFailureClass));
}

export function hasTrafficFailureStreak(runs: readonly TrafficFailureRun[]) {
  return (
    runs.length >= TRAFFIC_FAILURE_STREAK_THRESHOLD &&
    runs
      .slice(0, TRAFFIC_FAILURE_STREAK_THRESHOLD)
      .every((run) => run.status === "failed" && isTransientTrafficFailure(run.errorClass))
  );
}

export function hasProviderFailureShare(failedConnections: number, totalConnections: number) {
  return (
    totalConnections > 0 &&
    failedConnections / totalConnections >= TRAFFIC_PROVIDER_FAILURE_SHARE_THRESHOLD
  );
}

export function trafficReauthReason(reason: unknown): TrafficReauthReason | undefined {
  return reason === "permission" || reason === "scope" ? reason : undefined;
}

// Newest first: the failed run before any skipped runs is the one that stopped the connection.
export function trafficReauthCause(runs: readonly { meta: unknown; status: string }[]) {
  const cause = runs.find((run) => run.status !== "skipped_needs_reauth");
  if (cause?.status !== "failed" || !cause.meta || typeof cause.meta !== "object") return undefined;
  return trafficReauthReason((cause.meta as Record<string, unknown>).googleReason);
}
