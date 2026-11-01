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
  /** figuresKnown means measured or zero. estimated: ownership is proved, but part of the
   * amount is still an admission estimate; exact consumers must keep ignoring it. */
  budgets: readonly { status: BudgetStatus; figuresKnown: boolean; estimated?: true }[];
};
export type OwnBudgetReader = (input: OwnBudgetReadInput) => Promise<OwnBudgetRead | null>;
