import type { BudgetRow } from "@usagekit/views";

/** Authorized host labels only; accounting identities and amounts remain unchanged. */
export type ProjectBudgetDisplay = {
  projectName: string;
  /** Authorized public connection reference for grouping; never a storage identity. */
  connectionId?: string;
  providerLabel?: string;
};
export type ProjectBudgetRow = BudgetRow & { display?: ProjectBudgetDisplay };
