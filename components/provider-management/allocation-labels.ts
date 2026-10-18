"use client";

import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import type { AllocationProps } from "@/components/usagekit/provider-allocation-editor";
import type { UsageConnection } from "@/lib/metering/user-views";
import { dollarsFromNativeCents } from "@/lib/provider-ui/form-schema";
import type { ProviderAllocationRow } from "@usagekit/views";
import { useLocale, useTranslations } from "next-intl";

export function useAllocationLabels(
  connections: readonly UsageConnection[],
  rows: readonly ProviderAllocationRow[],
) {
  const locale = useLocale();
  const presentation = useUsagePresentation();
  const t = useTranslations("projectSettingsUsage.provider.budgetDialog");
  const common = useTranslations("projectIntegrations.providerManagement");
  const meter = useTranslations("projectSettingsUsage.meter");
  const labels: AllocationProps["labels"] = {
    title: t("title"),
    description: t(
      rows.some((row) => row.fundingSource === "platform")
        ? "descriptionWithCredits"
        : "description",
    ),
    app: t("appBudget"),
    programmatic: t("programmaticBudget"),
    limit: t("perMonth"),
    unlimited: t("placeholder"),
    limited: t("perMonth"),
    used: t("used"),
    reserved: common("reserved"),
    remaining: t("remaining"),
    available: t("useCreditBalance"),
    invalid: t("invalidBudget"),
    unavailable: common("balanceCannotApply"),
    save: t("save"),
    empty: t("empty"),
    reload: t("reloadAllocations"),
    refreshBalance: t("refreshProviderBalance"),
    refreshFailed: t("refreshError"),
  };
  const feedbackLabels: AllocationProps["feedbackLabels"] = {
    readOnly: common("readOnly"),
    pending: t("saving"),
    success: t("saved"),
    forbidden: common("forbidden"),
    invalid: t("invalidBudget"),
    conflict: common("conflict"),
    unknown: common("ambiguous"),
    reconcile: common("reconcile"),
    notApplied: t("notApplied"),
    unavailable: common("unavailable"),
    loading: common("loading"),
    empty: t("empty"),
    reload: common("reload"),
    own: t("sourceOwn"),
    platform: t("sourceCredits"),
    unknownValue: meter("unknown"),
    estimated: meter("certaintyValue.estimated"),
    unavailableValue: meter("unknown"),
    cents: t("cents"),
  };
  const rowLabels: NonNullable<AllocationProps["rowLabels"]> = (row) => {
    const credits = row.fundingSource === "platform";
    const app = row.surface === "app";
    return {
      section: t("sectionLabel", {
        connection: row.label,
        source: t(credits ? "sourceCredits" : "sourceOwn"),
        surface: t(app ? "appBudget" : "programmaticBudget"),
      }),
      field: t(
        credits
          ? app
            ? "creditsAppBudgetField"
            : "creditsProgrammaticBudgetField"
          : app
            ? "appBudgetField"
            : "programmaticBudgetField",
        {
          provider:
            connections.find((connection) => connection.connectionId === row.connectionId)
              ?.provider ?? row.label,
        },
      ),
      available: t(
        credits
          ? app
            ? "useCreditBalance"
            : "useProgrammaticCreditBalance"
          : app
            ? "useProviderBalance"
            : "useProgrammaticProviderBalance",
      ),
      refreshBalance: t("refreshProviderBalance"),
    };
  };
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 20 });
  const dollars = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formatFigure: NonNullable<AllocationProps["formatFigure"]> = (figure) => {
    const monetary = figure.unit === "cents";
    const text = monetary ? dollarsFromNativeCents(figure.text) : figure.text;
    if (text === null) return meter("unknown");
    // Intl preserves decimal string precision; TypeScript's Intl types omit string input.
    const format = (monetary ? dollars : number).format as (
      value: string | number | bigint,
    ) => string;
    return format(text);
  };
  const formatUnit = (unit: string) =>
    unit === "units"
      ? t("searchesAdornment")
      : unit === "customer_cents"
        ? presentation.unit(unit)
        : unit === "cents"
          ? ""
          : unit;
  return { labels, feedbackLabels, rowLabels, formatFigure, formatUnit };
}
