import "server-only";
import { paymentAdmissionFailure } from "@/lib/action-payment/admission-failure";
import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import { paymentFailure } from "@/lib/action-payment/session";
import { reportServerMessage } from "@/lib/observability/server-message";
import { OperationAccessDeniedError } from "@/lib/operations/access-error";
import { providerFailurePhase } from "@/lib/provider-lookups/failure-phase";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { chargedProviderCostCents, ProviderCallError } from "@/lib/providers/call-error";
import { ProviderCostLimitError } from "@/lib/providers/cost-limit";
import { deploymentLookupFailure } from "@/lib/providers/execution-extension";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit-error";
import {
  ProviderConnectionChangedError,
  ProviderUsagePersistenceError,
} from "@/lib/providers/usage";
import type { DomainOverviewFailureDetails } from "./failure-details";
import type { DomainOverviewLookupFailure } from "./types";

type Phase = DomainOverviewFailureDetails["phase"];
function usagePhase(error: ProviderUsagePersistenceError): Phase {
  if (error.phase === "admission") return "before_dispatch";
  if (error.phase === "request" || error.phase === "response_body") return "provider";
  return "persistence";
}

function classifiedFailure(error: unknown, depth = 0): DomainOverviewFailureDetails | null {
  if (depth >= 6) return null;
  if (error instanceof ProviderConnectionChangedError)
    return { reason: "provider_connection_changed", phase: "before_dispatch" };
  if (error instanceof ProviderUsagePersistenceError) {
    const cause = classifiedFailure(error.cause, depth + 1);
    return { ...cause, reason: cause?.reason ?? "usage_persistence", phase: usagePhase(error) };
  }
  const deployed = deploymentLookupFailure(error);
  if (deployed) return deployed;
  if (error instanceof OperationAccessDeniedError)
    return { reason: "operation_access_denied", phase: "before_dispatch" };
  if (error instanceof ProviderCostLimitError)
    return { reason: "cost_limit_exceeded", phase: "before_dispatch" };
  if (error instanceof ProviderRateLimitedError)
    return {
      reason: "rate_limited",
      phase: error.source === "local" ? "before_dispatch" : "provider",
    };
  if (error instanceof ProviderCallError)
    return { reason: "provider_error", phase: "provider", providerCode: error.code };
  if (error instanceof ProviderAuthError)
    return { reason: "provider_error", phase: "provider", providerCode: "provider_auth" };
  return null;
}

/** Never forward raw messages, causes, stacks, request data or identifiers to telemetry. */
export function reportDomainOverviewFailure(phase: Phase, error?: unknown) {
  const errorType =
    error instanceof TypeError
      ? "TypeError"
      : error instanceof RangeError
        ? "RangeError"
        : error instanceof Error
          ? "Error"
          : "non_error";
  void reportServerMessage("domain-overview-module-failure", {
    level: "error",
    extra: { phase, error_type: errorType },
  }).catch(() => undefined);
}

export function domainOverviewFailure(
  error: unknown,
  receipt?: ActionPaymentReceipt,
  module = false,
): DomainOverviewLookupFailure {
  const payment = paymentFailure(error);
  if (payment) return { ...payment, costCents: 0, phase: "before_dispatch" };
  if (error instanceof DeploymentAdmissionExhaustedError) {
    const failure = receipt ? paymentAdmissionFailure(error, receipt) : null;
    if (failure) return { ...failure, costCents: failure.costCents ?? 0, phase: "before_dispatch" };
    if (!module) throw error;
    return { costCents: 0, ok: false, reason: "payment_admission", phase: "before_dispatch" };
  }
  if (error instanceof ProviderLookupSignal)
    return {
      ...error.outcome,
      costCents: error.outcome.costCents ?? 0,
      phase:
        error.outcome.reason === "provider_error" || error.outcome.reason === "unsupported_location"
          ? "provider"
          : "before_dispatch",
    };
  const failure = classifiedFailure(error);
  const phase = providerFailurePhase(error) ?? failure?.phase ?? "provider";
  if (!failure || failure.reason === "usage_persistence") reportDomainOverviewFailure(phase, error);
  return {
    costCents: chargedProviderCostCents(error) ?? 0,
    ok: false,
    ...(failure ?? { reason: "unexpected" }),
    phase,
    ...(error instanceof ProviderRateLimitedError ? { resetAt: error.resetAt } : {}),
    ...(error instanceof ProviderCostLimitError
      ? { estimatedCostCents: error.estimatedCostCents }
      : {}),
  };
}
