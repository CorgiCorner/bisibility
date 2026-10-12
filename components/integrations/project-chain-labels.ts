"use client";

import type { ProjectChainProps } from "@/components/usagekit/provider-chain-editor";
import { useTranslations } from "next-intl";

export function useProjectChainLabels() {
  const t = useTranslations("projectIntegrations.fallback");
  const common = useTranslations("projectIntegrations.providerManagement");
  const labels: ProjectChainProps["labels"] = {
    title: t("title"),
    description: t("description"),
    up: t("moveUpAction"),
    down: t("moveDownAction"),
    enable: t("activateAction"),
    disable: t("pauseAction"),
    enabled: t("active"),
    disabled: t("pausedState"),
    first: t("first"),
    next: "",
    paused: t("paused"),
    save: t("save"),
    reload: t("reload"),
    empty: t("empty"),
    invalid: t("invalid"),
    add: t("activateAction"),
    remove: t("pauseAction"),
  };
  const feedbackLabels: ProjectChainProps["feedbackLabels"] = {
    readOnly: common("readOnly"),
    pending: t("saving"),
    success: t("saved"),
    forbidden: common("forbidden"),
    invalid: t("invalid"),
    conflict: common("conflict"),
    unknown: common("ambiguous"),
    reconcile: common("reconcile"),
    notApplied: t("notApplied"),
    unavailable: common("unavailable"),
    loading: common("loading"),
    empty: t("empty"),
    reload: t("reload"),
  };
  const formatPosition: ProjectChainProps["formatPosition"] = (row, index) =>
    row.enabled && index > 0 ? t("next", { position: index + 1 }) : null;
  return {
    labels,
    feedbackLabels,
    formatPosition,
    formatCount: (count: number) => t("activeCount", { count }),
  };
}
