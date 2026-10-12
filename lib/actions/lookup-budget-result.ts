import "server-only";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { budgetFailureResult } from "@/lib/rank-check/budget-failure";

/** Keep lookup refusals serializable at the action boundary without changing service errors. */
export async function withLookupBudgetResult<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    if (
      error instanceof DeploymentAdmissionExhaustedError &&
      error.reason === "budget" &&
      error.scope === "wallet"
    ) {
      return { ok: false as const, reason: "wallet_budget_exhausted" as const, costCents: 0 };
    }
    const budget = budgetFailureResult(error);
    if (!budget) throw error;
    return {
      ok: false as const,
      reason: "budget_exhausted" as const,
      costCents: 0,
      ...(budget.code !== "budget_exhausted" ? { budgetReason: budget.code } : {}),
    };
  }
}
