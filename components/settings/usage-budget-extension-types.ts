import type { AppLocale } from "@/i18n/config";
import type { ProjectUsageViews } from "@/lib/metering/user-views";
import type { UsageBudgetCredits } from "@/lib/settings/usage-budget-credits";
import type { ReactNode } from "react";

export type UsageBudgetExtensionInput = {
  locale: AppLocale;
  /** Trusted server context only: the principal viewing the Usage tab. */
  principalId: string;
  /** Internal project id resolved by the authorized page. */
  projectId: string;
  projectRef: string;
  projectName: string;
  /** The authorized usage read of this page; restricted reads carry no financial figures. */
  usage: ProjectUsageViews;
  /** The viewer may change project and provider limits. */
  canEditBudget: boolean;
  /** Deep link that opens provider budget editing. */
  editBudget: boolean;
};

/** Deployments without credits return null: the budget surfaces show own keys only. */
export type UsageBudgetExtension = {
  content: ReactNode;
  credits: UsageBudgetCredits;
  hostedBudgetLabels: { title: string; description: string };
  /** Replaces the provider budget and usage summary cards when present. */
  overview?: ReactNode;
};
