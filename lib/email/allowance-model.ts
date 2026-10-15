import type { EmailCategory } from "./types";

export type EmailAllowanceCategory = {
  category: EmailCategory;
  limit: number;
  reservedAttempts: number | null;
  remaining: number | null;
};
export type InstanceEmailAllowance = {
  asOf: string;
  day: string;
  resetsAt: string;
  scope: "installation";
  status: "available" | "unavailable" | "not_configured" | "disabled";
  categories: EmailAllowanceCategory[];
};
