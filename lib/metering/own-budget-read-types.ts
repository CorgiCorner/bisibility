import type { BudgetStatus } from "@usagekit/core";

/** Trusted server input; never accepted as a browser-selected accounting scope. */
export type OwnBudgetReadInput = {
  namespace: string;
  actorId: string;
  projectId: string;
  connectionId: string;
};
/** Internal verification metadata. Only the projected public budget row reaches UI. */
export type VerifiedOwnBudgetBinding = {
  namespace: string;
  principal: string;
  group: string;
  connection: string;
  publicConnection: string;
  provider: string;
  credentialVersion: string;
  tag: string;
  unit: "cents" | "units";
};
export type OwnBudgetRead = {
  binding: VerifiedOwnBudgetBinding;
  budgets: readonly { status: BudgetStatus; figuresKnown: boolean }[];
};
export type OwnBudgetReader = (input: OwnBudgetReadInput) => Promise<OwnBudgetRead | null>;
