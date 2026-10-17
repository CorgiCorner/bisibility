import type { BudgetRow, ExceptionsView, UsageView } from "@usagekit/views";
export type MeteringAdminFilters = { month: string; project: string | null };
export type MeteringAdminSection = "usage" | "exceptions";
export type MeteringAdminCursors = {
  section?: MeteringAdminSection;
  includeBudgets?: boolean;
  usageCursor?: string;
  exceptionCursor?: string;
  exceptionTo?: string;
};
export type MeteringAdminData = {
  usage: UsageView;
  budgets: BudgetRow[];
  budgetsUnavailable?: boolean;
  budgetsOmitted?: boolean;
  exceptions: ExceptionsView;
  projects: string[];
  truncated: boolean;
  /** Project names require owner or membership access; otherwise references retain public IDs. */
  references?: {
    projects: Record<string, string>;
    connections: Record<string, { project: string; provider: string }>;
  };
};
export type MeteringAdminPage = MeteringAdminFilters & {
  data: MeteringAdminData | null;
  months: string[];
};
