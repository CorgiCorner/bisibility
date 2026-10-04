import { ProviderCallError } from "@/lib/providers/call-error";
export const AI_REQUEST_BUDGET_MS = 40_000;
export class AiDeadlineError extends ProviderCallError {
  constructor() {
    super("AI analysis reached its aggregate request deadline.", 0);
  }
}
export function assertAiDeadline(deadlineAt: number) {
  if (Date.now() >= deadlineAt) throw new AiDeadlineError();
}
export function aiDeadlineSignal(deadlineAt: number, localBudgetMs: number) {
  assertAiDeadline(deadlineAt);
  return AbortSignal.timeout(Math.max(1, Math.min(localBudgetMs, deadlineAt - Date.now())));
}
