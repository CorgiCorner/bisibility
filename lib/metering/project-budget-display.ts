import type { BudgetRow } from "@usagekit/views";

/** Authorized host labels only; accounting identities and amounts remain unchanged. */
export type ProjectBudgetDisplay = {
  projectName: string;
  providerLabel?: string;
};
export type ProjectBudgetRow = BudgetRow & { display?: ProjectBudgetDisplay };
