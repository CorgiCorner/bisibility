import { isProviderErrorCode, type ProviderErrorCode } from "@/lib/providers/provider-error-code";

export const DOMAIN_OVERVIEW_FAILURE_REASONS = [
  "operation_access_denied",
  "payment_admission",
  "provider_connection_changed",
  "usage_persistence",
  "unexpected",
  "lookup_failed",
  "snapshot_expired",
  "budget_exhausted",
  "cost_limit_exceeded",
  "in_progress",
  "needs_reauth",
  "no_source",
  "rate_limited",
  "provider_error",
  "unsupported_location",
  "wallet_budget_exhausted",
  "insufficient_credits",
  "own_credentials_required",
  "credentials_changed",
  "payment_quote_required",
  "payment_quote_expired",
  "payment_quote_changed",
  "payment_unavailable",
  "payment_already_executed",
] as const;

export type DomainOverviewFailureDetails = {
  reason: (typeof DOMAIN_OVERVIEW_FAILURE_REASONS)[number];
  phase: "before_dispatch" | "provider" | "persistence";
  providerCode?: ProviderErrorCode;
};
export type StoredDomainOverviewModule<T> = T | DomainOverviewFailureDetails | null;

export function readDomainOverviewFailure(value: unknown): DomainOverviewFailureDetails | null {
  if (!value || typeof value !== "object" || !("reason" in value) || !("phase" in value))
    return null;
  if (
    !DOMAIN_OVERVIEW_FAILURE_REASONS.includes(
      value.reason as DomainOverviewFailureDetails["reason"],
    )
  )
    return null;
  if (!["before_dispatch", "provider", "persistence"].includes(String(value.phase))) return null;
  return {
    reason: value.reason as DomainOverviewFailureDetails["reason"],
    phase: value.phase as DomainOverviewFailureDetails["phase"],
    ...("providerCode" in value && isProviderErrorCode(value.providerCode)
      ? { providerCode: value.providerCode }
      : {}),
  };
}

export function storedDomainOverviewFailure(input: {
  reason: DomainOverviewFailureDetails["reason"];
  phase?: DomainOverviewFailureDetails["phase"];
  providerCode?: ProviderErrorCode;
}): DomainOverviewFailureDetails {
  return {
    reason: input.reason,
    phase: input.phase ?? "before_dispatch",
    ...(input.providerCode ? { providerCode: input.providerCode } : {}),
  };
}
