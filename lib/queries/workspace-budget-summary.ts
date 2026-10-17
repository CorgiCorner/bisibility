import "server-only";
import { getProjectMeteringBudgets } from "@/lib/metering/user-data";
import { emptyProjectUsage } from "@/lib/metering/user-views";
import { type BudgetsView, type HeaderStatus, headerStatusFromBudgets } from "@usagekit/views";
import { cache } from "react";
export type WorkspaceBudgetSummary = {
  status: HeaderStatus;
  budgets: BudgetsView;
  eligible: boolean;
  paidWorkBlocked: boolean | null;
};

const perRequestCache: typeof cache = typeof cache === "function" ? cache : (fn) => fn;

export const loadWorkspaceBudgetSummary = perRequestCache(async function loadWorkspaceBudgetSummary(
  projectRef: string,
): Promise<WorkspaceBudgetSummary> {
  const data = await getProjectMeteringBudgets(projectRef, "header").catch((error: unknown) => {
    const code =
      error && typeof error === "object"
        ? "code" in error
          ? error.code
          : "errorCode" in error
            ? error.errorCode
            : undefined
        : undefined;
    if (typeof code === "string" && ["P2024", "P1001", "P1002", "P1008", "P1017"].includes(code))
      return emptyProjectUsage();
    throw error;
  });
  const budgets: BudgetsView = {
    state:
      data.status === "restricted"
        ? "forbidden"
        : data.status === "unavailable"
          ? "unavailable"
          : data.budgets.length
            ? "ok"
            : "empty",
    rows: data.budgets,
    problem: null,
  };
  return {
    status: headerStatusFromBudgets(budgets),
    paidWorkBlocked: data.paidWorkBlocked,
    budgets,
    eligible: data.connections.length > 0 || data.budgets.length > 0,
  };
});
