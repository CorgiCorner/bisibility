/**
 * Credits context for the budget surfaces, supplied by the usage budget extension.
 * Deployments without credits never provide it, which hides every credits row.
 */
export type UsageBudgetCredits = {
  /** Providers that can run on credits in this deployment. */
  providers: readonly string[];
  /** Spendable wallet balance in cents; null when the viewer cannot see the wallet. */
  walletBalanceCents: number | null;
};
