import type { ProviderFailureClass } from "@/lib/providers/failure-class";

const USER_ACTIONABLE_FAILURES = new Set<ProviderFailureClass>(["auth", "config_invalid"]);
const TRANSIENT_FAILURES = new Set<ProviderFailureClass>(["network", "provider_5xx", "unknown"]);

export const TRAFFIC_FAILURE_STREAK_THRESHOLD = 3;
export const TRAFFIC_PROVIDER_FAILURE_SHARE_THRESHOLD = 0.25;

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
