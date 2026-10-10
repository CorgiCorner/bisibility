"use client";

import { BudgetEditRow, type BudgetRowErrors } from "@/components/settings/usage/BudgetEditRow";
import type {
  BudgetFormValues,
  BudgetSource,
  BudgetSurface,
} from "@/components/settings/usage/budget-edit-modal-model";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  tableHeaderClassName,
  tableHeaderFrameBorderClassName,
} from "@/components/ui/table-header-styles";
import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import type { ProviderSpendSourceBlock } from "@/lib/queries/provider-spend-types";
import type { UsageBudgetCredits } from "@/lib/settings/usage-budget-credits";
import { cn } from "@/lib/ui/cn";
import { useTranslations } from "next-intl";

const PROVIDER_BALANCE_PROVIDERS = new Set(["dataforseo", "serpapi"]);

type ConnectionErrors = Partial<Record<BudgetSource, BudgetRowErrors>>;

type BudgetEditTableProps = {
  connections: readonly ProviderSpendConnection[];
  credits: UsageBudgetCredits | null;
  errors: Record<string, ConnectionErrors>;
  formValues: (connection: ProviderSpendConnection) => BudgetFormValues;
  onCreditBalance: (connection: ProviderSpendConnection) => void;
  onFieldBlur: (
    connection: ProviderSpendConnection,
    source: BudgetSource,
    surface: BudgetSurface,
  ) => void;
  onFieldChange: (
    connection: ProviderSpendConnection,
    source: BudgetSource,
    surface: BudgetSurface,
    value: string,
  ) => void;
  onProviderBalance: (connection: ProviderSpendConnection) => void;
  refreshing: string | null;
  saving: boolean;
  showPrimaryChip: boolean;
};

function sourceHasData(block: ProviderSpendSourceBlock) {
  return (
    block.surfaces.app.allocation !== null ||
    block.surfaces.programmatic.allocation !== null ||
    block.used > 0 ||
    block.usedPriorMonth > 0 ||
    block.requestCount > 0
  );
}

/** A Credits row appears where credits can run, or where credits budgets or spend exist. */
function showsCreditsRow(
  connection: ProviderSpendConnection,
  credits: UsageBudgetCredits | null,
): boolean {
  if (!credits) return false;
  return (
    connection.credentialSource === "hosted" ||
    credits.providers.includes(connection.providerId) ||
    sourceHasData(connection.credits)
  );
}

/** Bordered budget table: one provider group, then a row for each paying source. */
export function BudgetEditTable({
  connections,
  credits,
  errors,
  formValues,
  onCreditBalance,
  onFieldBlur,
  onFieldChange,
  onProviderBalance,
  refreshing,
  saving,
  showPrimaryChip,
}: Readonly<BudgetEditTableProps>) {
  const t = useTranslations("projectSettingsUsage.provider.budgetDialog");

  function sourceRow(
    connection: ProviderSpendConnection,
    source: BudgetSource,
    options: { autoFocus: boolean; creditsShown: boolean },
  ) {
    const refreshKey = `${connection.connectionId}:${source}`;
    const balanceAction =
      source === "own"
        ? connection.credentialSource === "own" &&
          PROVIDER_BALANCE_PROVIDERS.has(connection.providerId)
          ? {
              label: t("useProviderBalance"),
              onClick: () => onProviderBalance(connection),
            }
          : null
        : credits?.walletBalanceCents != null
          ? { label: t("useCreditBalance"), onClick: () => onCreditBalance(connection) }
          : null;
    return (
      <BudgetEditRow
        autoFocus={options.autoFocus}
        balanceAction={balanceAction}
        balanceRefreshing={refreshing === refreshKey}
        connection={connection}
        errors={errors[connection.connectionId]?.[source]}
        key={source}
        label={
          source === "credits"
            ? t("sourceCredits")
            : options.creditsShown
              ? t("sourceOwn")
              : t("perMonth")
        }
        onBlur={(surface) => onFieldBlur(connection, source, surface)}
        onChange={(surface, value) => onFieldChange(connection, source, surface, value)}
        saving={saving}
        source={source}
        values={formValues(connection)[source]}
      />
    );
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-control border border-border">
      <div className="grid w-full min-w-[480px] grid-cols-[minmax(0,34%)_minmax(0,1fr)_minmax(0,1fr)] text-left">
        <div
          className={cn(tableHeaderClassName, tableHeaderFrameBorderClassName, "px-3 py-2")}
          data-table-header-border="frame"
        >
          {t("providerColumn")}
        </div>
        <div
          className={cn(tableHeaderClassName, tableHeaderFrameBorderClassName, "px-3 py-2")}
          data-table-header-border="frame"
        >
          <span className="inline-flex items-center gap-0.5">
            {t("appBudget")}
            <InfoTooltip text={t("appColumnHelp")} />
          </span>
        </div>
        <div
          className={cn(tableHeaderClassName, tableHeaderFrameBorderClassName, "px-3 py-2")}
          data-table-header-border="frame"
        >
          <span className="inline-flex items-center gap-0.5">
            {t("programmaticBudget")}
            <InfoTooltip text={t("programmaticColumnHelp")} />
          </span>
        </div>
        {connections.map((connection, index) => {
          const creditsShown = showsCreditsRow(connection, credits);
          return (
            <div className="col-span-3 grid grid-cols-subgrid" key={connection.connectionId}>
              <div
                className={cn(
                  "col-span-3 px-3 pb-0.5 pt-3 text-left",
                  index > 0 && "border-t border-border",
                )}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[13px] font-semibold text-fg">
                    {connection.provider}
                  </span>
                  {showPrimaryChip && connection.primary ? (
                    <StatusPill label={t("primary")} showDot={false} size="sm" status="optional" />
                  ) : null}
                  {creditsShown ? (
                    <StatusPill
                      label={t("activeSource", {
                        source: connection.credentialSource === "hosted" ? "credits" : "own",
                      })}
                      showDot={false}
                      size="sm"
                      status="optional"
                    />
                  ) : null}
                </span>
              </div>
              {sourceRow(connection, "own", { autoFocus: index === 0, creditsShown })}
              {creditsShown
                ? sourceRow(connection, "credits", { autoFocus: false, creditsShown })
                : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
