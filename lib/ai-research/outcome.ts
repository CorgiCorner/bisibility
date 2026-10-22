import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import { paymentFailure } from "@/lib/action-payment/session";
import { isBudgetExhaustedError } from "@/lib/metering/admission-errors";
import {
  budgetDenialReason,
  MISSING_PROJECT_BUDGET_MESSAGE,
  UNRESOLVED_USAGE_MESSAGE,
} from "@/lib/metering/budget-denial";
import { redactOpsText } from "@/lib/ops/redact-text";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import type { AiResearchOutcome } from "./outcome-types";
import { AiPreDispatchRefusal, AiResearchValidationError } from "./validation";
export class AiResearchPaidFailure extends Error {
  constructor(
    readonly original: unknown,
    readonly payment: ActionPaymentReceipt,
  ) {
    super("Paid AI attempt requires retained receipt review.");
  }
}
export async function outcome(load: () => Promise<AiResearchOutcome>): Promise<AiResearchOutcome> {
  try {
    return await load();
  } catch (caught) {
    if (caught instanceof AiResearchPaidFailure) {
      // The customer sees a generic refusal; operators need the cause behind the paid attempt.
      logPaidFailure(caught);
      return {
        ok: false,
        reason: "provider_error",
        message: "Review this attempt and its payment before starting another analysis.",
        retryBlocked: true,
        payment: caught.payment,
      };
    }
    const payment = paymentFailure(caught);
    if (payment)
      return { ...payment, message: "Review the current payment quote before starting." };
    const safe = caught instanceof AiPreDispatchRefusal;
    const error = safe ? caught.original : caught;
    const refusal = safe ? { safeToStartNewRequest: true, retryBlocked: false } : {};
    if (error instanceof AiResearchValidationError)
      return {
        ok: false,
        reason: error.reason,
        message: error.message,
        ...refusal,
        ...(["usage_reconciliation_required", "idempotency_conflict"].includes(error.reason)
          ? { retryBlocked: true }
          : {}),
      };
    if (error instanceof ProviderLookupSignal)
      return {
        ok: false,
        ...refusal,
        ...(error.outcome.reason === "cost_limit_exceeded"
          ? { estimatedCostCents: error.outcome.estimatedCostCents }
          : {}),
        reason: budgetDenialReason(error.outcome) ?? error.outcome.reason,
        ...(budgetDenialReason(error.outcome) === "usage_reconciliation_required"
          ? { retryBlocked: true }
          : {}),
        message:
          budgetDenialReason(error.outcome) === "budget_missing"
            ? MISSING_PROJECT_BUDGET_MESSAGE
            : budgetDenialReason(error.outcome) === "usage_reconciliation_required"
              ? UNRESOLVED_USAGE_MESSAGE
              : error.outcome.reason === "no_source"
                ? "Connect a compatible data provider in Integrations."
                : `Analysis unavailable: ${error.outcome.reason}.`,
      };
    if (
      safe &&
      budgetDenialReason(error) &&
      (isBudgetExhaustedError(error) ||
        (error instanceof DeploymentAdmissionExhaustedError && error.reason === "budget"))
    )
      return {
        ok: false,
        reason: budgetDenialReason(error) ?? "budget_missing",
        message:
          budgetDenialReason(error) === "usage_reconciliation_required"
            ? UNRESOLVED_USAGE_MESSAGE
            : MISSING_PROJECT_BUDGET_MESSAGE,
        ...refusal,
        ...(budgetDenialReason(error) === "usage_reconciliation_required"
          ? { retryBlocked: true }
          : {}),
      };
    if (safe)
      return {
        ok: false,
        reason: "analysis_refused",
        message:
          "Analysis was refused before any paid provider request. Review provider availability and limits before creating a new request.",
        ...refusal,
      };
    throw error;
  }
}

function logPaidFailure(failure: AiResearchPaidFailure) {
  const { original, payment } = failure;
  console.error("[ai-research] paid attempt failed after provider dispatch", {
    error: redactOpsText(
      original instanceof Error ? (original.stack ?? original.message) : original,
      2_000,
    ),
    name: original instanceof Error ? original.name : typeof original,
    code:
      original && typeof original === "object" && "code" in original ? String(original.code) : null,
    actionId: payment.actionId,
    paymentState: payment.state,
  });
}
