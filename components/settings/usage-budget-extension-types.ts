import type { AppLocale } from "@/i18n/config";
import type { UsageBudgetCredits } from "@/lib/settings/usage-budget-credits";
import type { ReactNode } from "react";

export type UsageBudgetExtensionInput = {
  locale: AppLocale;
  /** Trusted server context only: the principal viewing the Usage tab. */
  principalId: string;
  /** Internal project id resolved by the authorized page. */
  projectId: string;
  projectRef: string;
};

/** Deployments without credits return null: the budget surfaces show own keys only. */
export type UsageBudgetExtension = {
  content: ReactNode;
  credits: UsageBudgetCredits;
  description: ReactNode;
};
