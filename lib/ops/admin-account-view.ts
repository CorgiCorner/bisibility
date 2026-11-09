/** Shared instance account facts. Billing fields belong to edition extensions. */
export type AdminAccountView = {
  id: string;
  email: string;
  status: "active" | "deactivated";
  created: string;
  lastActive: string;
  projects: number | null;
  keywords: number | null;
  connections: string;
};
export type AdminAccountsState = "ready" | "loading" | "unavailable";
