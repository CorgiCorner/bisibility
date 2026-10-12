import "server-only";
import {
  isBudgetExhaustedError,
  ProviderAllocationExhaustedError,
} from "@/lib/metering/admission-errors";
import {
  budgetDenialReason,
  isMissingProjectBudget,
  MISSING_PROJECT_BUDGET_MESSAGE,
  UNRESOLVED_USAGE_MESSAGE,
} from "@/lib/metering/budget-denial";
import { ProviderLookupSignal } from "@/lib/provider-lookups/lookup-failure";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { budgetExhaustedResult } from "./budget-contract";

/** Convert admission refusals before the Server Action transport redacts thrown errors. */
export function budgetFailureResult(error: unknown) {
  const lookup =
    error instanceof ProviderLookupSignal && error.outcome.reason === "budget_exhausted"
      ? error.outcome
      : null;
  if (
    !lookup &&
    !isBudgetExhaustedError(error) &&
    !(error instanceof ProviderAllocationExhaustedError) &&
    !(error instanceof DeploymentAdmissionExhaustedError && error.reason === "budget")
  )
    return null;
  const missing = isMissingProjectBudget(lookup ?? error);
  if (budgetDenialReason(lookup ?? error) === "usage_reconciliation_required") {
    return {
      code: "usage_reconciliation_required" as const,
      message: UNRESOLVED_USAGE_MESSAGE,
      status: "not_started" as const,
    };
  }
  return budgetExhaustedResult(
    missing
      ? MISSING_PROJECT_BUDGET_MESSAGE
      : error instanceof Error && !lookup
        ? error.message
        : "Monthly provider budget reached.",
    missing,
  );
}
