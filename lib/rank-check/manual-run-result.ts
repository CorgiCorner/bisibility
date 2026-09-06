import type { BudgetExhaustedResult } from "@/lib/rank-check/budget-contract";
import type { UnrunnableReason } from "@/lib/rank-check/runnable-reasons";

/**
 * `check_in_progress` is this surface's own name for a check already in flight; the predicate
 * causes keep the codes `runnable-reasons.ts` gives them, so the screen, the run views and the
 * claim loop all name a paused market the same way.
 */
export type RunCheckNowBlockedCode =
  | "check_in_progress"
  | "no_provider"
  | "sample_project"
  | UnrunnableReason;

export type RunCheckNowResult =
  | BudgetExhaustedResult
  | {
      code: RunCheckNowBlockedCode;
      message: string;
      status: "not_started";
    }
  | { runId: string; status: "queued" }
  | {
      attempts: number;
      billingUnits: number | null;
      position: number | null;
      provider: string;
      rankCheckId: string;
      requestedDepth: number | null;
      runId: string;
      status: "completed";
    };
