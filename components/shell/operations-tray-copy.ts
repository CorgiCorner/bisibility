import type { useDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import type { useTranslations } from "next-intl";
import type { TrayOperation } from "./OperationsTrayModel";
import { localizeGscTrayOperation } from "./operations-tray-gsc-copy";

type OperationsTranslator = ReturnType<typeof useTranslations<"shell.operations">>;

function rankSelectionLabel(
  selection: NonNullable<TrayOperation["rankCheck"]>["selectionKind"],
  t: OperationsTranslator,
) {
  return t(`rank.selectionKinds.${selection}`);
}

function rankTitle(
  trigger: NonNullable<TrayOperation["rankCheck"]>["trigger"],
  t: OperationsTranslator,
) {
  return t(`rank.titles.${trigger}`);
}

function blockedStateLine(
  operation: NonNullable<TrayOperation["rankCheck"]>,
  deploymentMode: ReturnType<typeof useDeploymentMode>,
  locale: string,
  t: OperationsTranslator,
) {
  if (operation.blockedReason === "temporal_unavailable") {
    return deploymentMode === "self-host"
      ? t("rank.blocked.workerSelfHost")
      : t("rank.blocked.workerCloud");
  }
  if (operation.blockedReason === "usage_reconciliation_required")
    return t("rank.blocked.budgetWithoutAmounts");
  if (operation.blockedReason === "budget_exhausted") {
    if (!operation.budget) return t("rank.blocked.budgetWithoutAmounts");
    const formatCurrency = (cents: number) =>
      new Intl.NumberFormat(locale, { currency: "USD", style: "currency" }).format(cents / 100);
    return t("rank.blocked.budgetWithAmounts", {
      cap: formatCurrency(operation.budget.capCents),
      spent: formatCurrency(operation.budget.spentCents),
    });
  }
  if (
    operation.blockedReason === "no_provider" ||
    operation.blockedReason === "credentials_unavailable"
  ) {
    return t("rank.blocked.noProvider");
  }
  if (operation.blockedReason === "market_inactive") return t("rank.blocked.marketInactive");
  if (operation.blockedReason === "keyword_archived") return t("rank.blocked.keywordArchived");
  if (operation.blockedReason === "provider_unavailable")
    return t("rank.blocked.providerUnavailable");
  return t("rank.blocked.waiting");
}

export function localizedTrayOperation(
  operation: TrayOperation,
  deploymentMode: ReturnType<typeof useDeploymentMode>,
  locale: string,
  t: OperationsTranslator,
): TrayOperation {
  if (operation.gscImport) return localizeGscTrayOperation(operation, t);
  if (!operation.rankCheck) return operation;
  const rankCheck = operation.rankCheck;
  const keywordCount = t("rank.keywordCount", { count: rankCheck.keywordCount });
  return {
    ...operation,
    meta:
      rankCheck.selectionKind === "single" || rankCheck.trigger === "scheduled"
        ? keywordCount
        : t("rank.scope", {
            keywords: keywordCount,
            selection: rankSelectionLabel(rankCheck.selectionKind, t),
          }),
    stateLine: operation.blocked ? blockedStateLine(rankCheck, deploymentMode, locale, t) : null,
    title: rankTitle(rankCheck.trigger, t),
    unit: t("rank.targetUnit", { count: operation.total }),
  };
}
