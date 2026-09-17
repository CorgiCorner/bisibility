import type { RankCheckOperation } from "@/lib/rank-check/runs/contract";
import type { useTranslations } from "next-intl";

type RankRunsTranslator = ReturnType<typeof useTranslations<"projectRuns.rankRuns">>;
type ClientDeploymentMode = "self-host" | "cloud";
type RankCheckRunBudget = NonNullable<RankCheckOperation["budget"]>;

type BlockedCopy = {
  action: "connection_settings" | "edit_budget" | "worker_status" | null;
  compact: string;
  description: string;
  title: string;
};

export function localizedBlockedRunCopy(
  {
    budget,
    deploymentMode,
    reason,
  }: Readonly<{
    budget?: RankCheckRunBudget | null;
    deploymentMode: ClientDeploymentMode;
    reason: string | null;
  }>,
  t: RankRunsTranslator,
  locale: string,
): BlockedCopy {
  if (reason === "temporal_unavailable") {
    return deploymentMode === "self-host"
      ? {
          action: "worker_status",
          compact: t("blocked.workerWaiting"),
          description: t("blocked.workerSelfHostDescription"),
          title: t("blocked.workerWaiting"),
        }
      : {
          action: null,
          compact: t("blocked.workerWaiting"),
          description: t("blocked.workerCloudDescription"),
          title: t("blocked.workerWaiting"),
        };
  }
  if (reason === "budget_exhausted") {
    const spent = budget
      ? new Intl.NumberFormat(locale, { currency: "USD", style: "currency" }).format(
          budget.spentCents / 100,
        )
      : null;
    const cap = budget
      ? new Intl.NumberFormat(locale, { currency: "USD", style: "currency" }).format(
          budget.capCents / 100,
        )
      : null;
    return {
      action: "edit_budget",
      compact: t("blocked.budgetReached"),
      description: t("blocked.budgetDescription", {
        cap: cap ?? "",
        spent: spent ?? "",
        withBudget: budget ? "yes" : "no",
      }),
      title: t("blocked.budgetReached"),
    };
  }
  if (reason === "no_provider" || reason === "credentials_unavailable") {
    return {
      action: "connection_settings",
      compact: t("blocked.noProvider"),
      description: t("blocked.noProviderDescription"),
      title: t("blocked.noProvider"),
    };
  }
  if (reason === "market_inactive") {
    return {
      action: null,
      compact: t("blocked.marketInactive"),
      description: t("blocked.marketInactiveDescription"),
      title: t("blocked.marketInactive"),
    };
  }
  if (reason === "keyword_archived") {
    return {
      action: null,
      compact: t("blocked.keywordArchived"),
      description: t("blocked.keywordArchivedDescription"),
      title: t("blocked.keywordArchived"),
    };
  }
  if (reason === "target_paused") {
    return {
      action: null,
      compact: t("blocked.targetPaused"),
      description: t("blocked.targetPaused"),
      title: t("blocked.targetPaused"),
    };
  }
  if (reason === "location_language_unavailable") {
    return {
      action: null,
      compact: t("blocked.locationLanguageUnavailable"),
      description: t("blocked.locationLanguageUnavailable"),
      title: t("blocked.locationLanguageUnavailable"),
    };
  }
  if (reason === "provider_unavailable") {
    return {
      action: null,
      compact: t("blocked.providerUnavailable"),
      description: t("blocked.providerUnavailableDescription"),
      title: t("blocked.providerUnavailable"),
    };
  }
  return {
    action: null,
    compact: t("blocked.waiting"),
    description: t("blocked.waitingDescription"),
    title: t("blocked.waiting"),
  };
}
