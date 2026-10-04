import { isOperationAccessDeniedError } from "@/lib/operations/access-error";
import { ProviderLookupSignal } from "@/lib/provider-lookups/lookup-failure";
import { ProviderCallError } from "@/lib/providers/call-error";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { AiDeadlineError } from "./deadline";

export function researchFailure(error: unknown, dispatched: boolean) {
  const cost =
    error instanceof ProviderLookupSignal
      ? error.outcome.costCents
      : error instanceof ProviderCallError
        ? error.costCents
        : null;
  const measured = typeof cost === "number" && Number.isFinite(cost) && cost >= 0;
  const costStatus = !dispatched || measured ? ("confirmed" as const) : ("unknown" as const);
  let reason = "provider_failure";
  if (error instanceof ProviderLookupSignal) reason = error.outcome.reason;
  else if (error instanceof DeploymentAdmissionExhaustedError)
    reason = error.reason === "balance" ? "credits_exhausted" : "budget_exhausted";
  else if (isOperationAccessDeniedError(error)) reason = "operation_unavailable";
  else if (error instanceof AiDeadlineError) reason = "deadline_reached";
  return {
    costCents: measured ? cost : 0,
    costStatus,
    message:
      costStatus === "unknown"
        ? "Provider request failed or usage is uncertain. Review provider usage before retrying."
        : `Analysis stopped: ${reason}. Partial results and confirmed costs are preserved.`,
  };
}
