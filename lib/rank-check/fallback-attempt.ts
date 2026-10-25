import { BudgetExhaustedError } from "@/lib/metering/admission-errors";
import { ProviderAllocationExhaustedError } from "@/lib/provider-usage/enforcement";
import { surfaceOf } from "@/lib/provider-usage/surface";
import type { ProviderRequestSource } from "@/lib/provider-usage/tag";
import { ProviderCallError, providerErrorCodeFromError } from "@/lib/providers/call-error";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import type { FallbackAttempt } from "./provider-chain-error";
import { RankCheckRunnerError, type RankCheckRunnerErrorCode } from "./runner-error";

const FALLBACK_CODES: ReadonlySet<RankCheckRunnerErrorCode> = new Set([
  "provider_failed",
  "provider_rate_limited",
  "credentials_unavailable",
]);

export function fallbackAttempt(
  error: unknown,
  provider: string,
  source?: ProviderRequestSource,
): {
  attempt: FallbackAttempt;
  rateLimited: boolean;
  admission?: DeploymentAdmissionExhaustedError;
  funding?: BudgetExhaustedError;
} | null {
  // One funding source (Credits or own keys) reached its project limit: the next provider may be
  // paid from the other source. The shared project cap and unresolved usage still stop the chain.
  if (
    error instanceof BudgetExhaustedError &&
    error.budget.fundingSource &&
    error.budget.reason !== "usage_reconciliation_required" &&
    error.budget.reason !== "budget_missing"
  ) {
    return {
      attempt: { message: error.message, provider, reason: "funding_exhausted" },
      funding: error,
      rateLimited: false,
    };
  }
  if (
    (error instanceof ProviderAllocationExhaustedError ||
      error instanceof DeploymentAdmissionExhaustedError) &&
    (error.budgetReason === "usage_reconciliation_required" ||
      error.budgetReason === "budget_missing")
  )
    return null;
  if (
    error instanceof ProviderAllocationExhaustedError ||
    error instanceof DeploymentAdmissionExhaustedError
  ) {
    return {
      admission:
        error instanceof DeploymentAdmissionExhaustedError
          ? error
          : new DeploymentAdmissionExhaustedError("budget", {
              scope: "connection",
              surface: error.surface,
            }),
      attempt: {
        message: error.message,
        provider,
        reason: "allocation_exhausted",
        surface:
          error instanceof ProviderAllocationExhaustedError
            ? error.surface
            : (error.surface ?? surfaceOf(source)),
      },
      rateLimited: false,
    };
  }
  if (error instanceof ProviderCallError && error.code === "provider_capacity_unavailable") {
    return { attempt: { provider, message: error.message, code: error.code }, rateLimited: false };
  }
  if (
    error instanceof RankCheckRunnerError &&
    FALLBACK_CODES.has(error.code) &&
    !(error.chargedCents !== null && error.chargedCents > 0)
  ) {
    return {
      attempt: {
        message: error.message,
        provider,
        code:
          error.code === "provider_rate_limited"
            ? "provider_rate_limited"
            : providerErrorCodeFromError(error.cause),
      },
      rateLimited: error.code === "provider_rate_limited",
    };
  }
  return null;
}
