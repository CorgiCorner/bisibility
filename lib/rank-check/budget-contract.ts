export const BUDGET_EXHAUSTED_CODE = "budget_exhausted";

export type BudgetExhaustedResult = {
  code: typeof BUDGET_EXHAUSTED_CODE;
  message: string;
  status: "not_started";
};

export function budgetExhaustedResult(message: string): BudgetExhaustedResult {
  return {
    code: BUDGET_EXHAUSTED_CODE,
    message,
    status: "not_started",
  };
}

export function isBudgetExhaustedResult(value: unknown): value is BudgetExhaustedResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<BudgetExhaustedResult>;
  return (
    result.code === BUDGET_EXHAUSTED_CODE &&
    typeof result.message === "string" &&
    result.status === "not_started"
  );
}
