export type MeteringAdminFilters = { month: string; project: string | null };
export type MeteringUsageRow = {
  id: string;
  connection: string;
  surface: string;
  funding: string;
  meter: string | null;
  reserved: string | null;
  legacy: string | null;
  difference: string | null;
  certainty: string;
};
export type MeteringBudgetRow = {
  id: string;
  connection: string;
  surface: string;
  used: string | null;
  reserved: string | null;
  remaining: string | null;
  resetsAt: string | null;
};
export type MeteringExceptionRow = {
  id: string;
  operation: string;
  state: string;
  updatedAt: string;
};
export type MeteringAdminData = {
  usage: MeteringUsageRow[];
  budgets: MeteringBudgetRow[];
  exceptions: MeteringExceptionRow[];
  projects: string[];
  disagreements: string;
  truncated: boolean;
};
export type MeteringAdminPage = MeteringAdminFilters & {
  data: MeteringAdminData | null;
  months: string[];
};
