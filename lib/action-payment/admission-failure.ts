import "server-only";
import type { ProviderLookupFailure } from "@/lib/provider-lookups/lookup-failure";
import {
  DeploymentAdmissionExhaustedError,
  OwnProviderKeyRequiredError,
} from "@/lib/providers/execution-extension-errors";
import { budgetFailureResult } from "@/lib/rank-check/budget-failure";
import type { ActionPaymentReceipt } from "./contract";

/** Preserve a later native admission refusal together with earlier retained charges. */
export function paymentAdmissionFailure(
  error: unknown,
  payment: ActionPaymentReceipt,
  previousProviderCostCents?: number,
):
  | (ProviderLookupFailure & {
      reason:
        | "budget_exhausted"
        | "insufficient_credits"
        | "own_credentials_required"
        | "wallet_budget_exhausted";
    })
  | null {
  if (!(error instanceof DeploymentAdmissionExhaustedError)) return null;
  const retained = {
    payment,
    ...(previousProviderCostCents === undefined ? {} : { costCents: previousProviderCostCents }),
  };
  if (error instanceof OwnProviderKeyRequiredError)
    return { ok: false, reason: "own_credentials_required", ...retained };
  if (error.reason === "balance") return { ok: false, reason: "insufficient_credits", ...retained };
  if (error.scope === "wallet")
    return { ok: false, reason: "wallet_budget_exhausted", ...retained };
  const budget = budgetFailureResult(error);
  return {
    ok: false,
    reason: "budget_exhausted",
    ...retained,
    ...(budget && budget.code !== "budget_exhausted" ? { budgetReason: budget.code } : {}),
    ...(error.surface ? { surface: error.surface } : {}),
    ...(error.resetAt ? { resetAt: error.resetAt.getTime() } : {}),
  };
}
