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
};
export type MeteringAdminPage = MeteringAdminFilters & {
  data: MeteringAdminData | null;
  months: string[];
};
