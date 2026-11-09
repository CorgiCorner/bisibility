import { paymentFailure } from "@/lib/action-payment/session";
import { budgetFailureResult } from "@/lib/rank-check/budget-failure";
import { actionFailureResult, handledActionResult } from "./action-result";

export async function trackingActionResult<T>(run: () => Promise<T>) {
  try {
    return await handledActionResult(run);
  } catch (error) {
    const payment = paymentFailure(error);
    if (payment)
      return actionFailureResult({ code: "conflict", message: payment.reason, status: 409 });
    const budget = budgetFailureResult(error);
    if (!budget) throw error;
    return actionFailureResult({ code: budget.code, message: budget.message, status: 429 });
  }
}
