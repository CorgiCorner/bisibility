/** Project-only display data. No payer, wallet, credential, pool or internal operation IDs. */
export type ProjectMeteringUsage = {
  status: "available" | "unavailable" | "restricted";
  from: string;
  to: string;
  asOf: string | null;
  authority: "legacy" | "preparing" | "active" | "draining" | "mixed" | "unknown";
  observed: boolean;
  truncated: boolean;
  unresolved: number;
  oldestUnresolvedAt: string | null;
  rows: ProjectMeteringRow[];
  budgets: ProjectMeteringBudget[];
};

export type ProjectMeteringRow = {
  connection: string | null;
  provider: string;
  surface: string;
  source: string;
  funding: "byok" | "platform";
  providerCost: string | null;
  customerCharge: string | null;
  units: string | null;
  unitsCertainty: "measured" | "estimated" | "unknown";
  certainty: "measured" | "estimated" | "unknown";
  unknownOperations: string;
};

export type ProjectMeteringBudget = {
  provider: string | null;
  figuresKnown: boolean;
  connection: string | null;
  scope: "project" | "connection";
  surface: string;
  unit: string;
  used: string | null;
  reserved: string | null;
  remaining: string | null;
  limit: string | null;
  hardLimit: string | null;
  unlimited: boolean;
  policy: "allow" | "block";
  resetsAt: string | null;
};
