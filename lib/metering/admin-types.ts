import type { BudgetRow, ExceptionsView, UsageView } from "@usagekit/views";
export type MeteringAdminFilters = { month: string; project: string | null };
export type MeteringAdminCursors = {
  usageCursor?: string;
  exceptionCursor?: string;
  exceptionTo?: string;
};
export type MeteringAdminData = {
  usage: UsageView;
  budgets: BudgetRow[];
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
