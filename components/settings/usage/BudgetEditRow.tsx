"use client";

import { BudgetAmountField } from "@/components/settings/usage/BudgetAmountField";
import type {
  BudgetSource,
  BudgetSourceValues,
  BudgetSurface,
} from "@/components/settings/usage/budget-edit-modal-model";
import { Button } from "@/components/ui/Button";
import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import { cn } from "@/lib/ui/cn";
import { useLocale, useTranslations } from "next-intl";

export type BudgetRowErrors = { app?: string; programmatic?: string; row?: string };

type BudgetEditRowProps = Readonly<{
  autoFocus: boolean;
  balanceAction: { label: string; onClick: () => void } | null;
  balanceRefreshing: boolean;
  connection: ProviderSpendConnection;
  errors: BudgetRowErrors | undefined;
  /** Label of the row header cell: the source, or the plain budget label without credits. */
  label: string;
  onBlur: (surface: BudgetSurface) => void;
  onChange: (surface: BudgetSurface, value: string) => void;
  saving: boolean;
  source: BudgetSource;
  values: BudgetSourceValues;
}>;

/** One body row of the budget table: a paying source with its two monthly budgets. */
export function BudgetEditRow({
  autoFocus,
  balanceAction,
  balanceRefreshing,
  connection,
  errors,
  label,
  onBlur,
  onChange,
  saving,
  source,
  values,
}: BudgetEditRowProps) {
  const locale = useLocale();
  const t = useTranslations("projectSettingsUsage.provider.budgetDialog");
  const block = source === "own" ? connection.own : connection.credits;
  const active = (connection.credentialSource === "hosted" ? "credits" : "own") === source;
  const showSplitNotice =
    source === "own" &&
    block.surfaces.app.allocation !== null &&
    block.surfaces.programmatic.allocation !== null &&
    block.surfaces.app.allocation.amountPerMonth ===
      block.surfaces.programmatic.allocation.amountPerMonth;
  const messages = [
    errors?.app ? { key: "app", text: errors.app, tone: "error" } : null,
    errors?.programmatic ? { key: "programmatic", text: errors.programmatic, tone: "error" } : null,
    showSplitNotice ? { key: "split", text: t("splitNotice"), tone: "muted" } : null,
    errors?.row ? { key: "row", text: errors.row, tone: "error" } : null,
  ].filter((message) => message !== null);

  function formatAmount(amount: number) {
    if (block.unit === "units") return t("searches", { count: amount });
    const fractionDigits = Math.abs(amount / 100) < 100 ? 2 : 0;
    return new Intl.NumberFormat(locale, {
      currency: "USD",
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
      style: "currency",
    }).format(amount / 100);
  }

  function fieldLabel(surface: BudgetSurface) {
    if (source === "credits") {
      return surface === "app"
        ? t("creditsAppBudgetField", { provider: connection.provider })
        : t("creditsProgrammaticBudgetField", { provider: connection.provider });
    }
    return surface === "app"
      ? t("appBudgetField", { provider: connection.provider })
      : t("programmaticBudgetField", { provider: connection.provider });
  }

  return (
    <>
      <div
        className={cn("px-3 py-2.5 text-left", !active && "text-fg-muted")}
        data-active={active ? "true" : "false"}
        data-source={source}
      >
        <span className={cn("block text-[12.5px] font-semibold", active ? "text-fg" : "")}>
          {label}
        </span>
        <span className="mt-0.5 block font-sans tabular-nums text-[10px] text-fg-muted">
          {t("thisAndLastMonth", {
            lastMonth: formatAmount(block.usedPriorMonth),
            thisMonth: formatAmount(block.used),
          })}
        </span>
      </div>
      {(["app", "programmatic"] as const).map((surface) => (
        <div className="px-3 py-2.5" key={surface}>
          <BudgetAmountField
            aria-label={fieldLabel(surface)}
            autoFocus={autoFocus && surface === "app"}
            error={errors?.[surface]}
            onBlur={() => onBlur(surface)}
            onChange={(event) => onChange(surface, event.target.value)}
            unit={block.unit}
            value={values[surface]}
          />
          {surface === "app" && balanceAction ? (
            <Button
              className="mt-1"
              disabled={saving || balanceRefreshing}
              onClick={balanceAction.onClick}
              size="xs"
              variant="ghost"
            >
              {balanceRefreshing ? t("refreshing") : balanceAction.label}
            </Button>
          ) : null}
        </div>
      ))}
      {messages.length ? (
        <div className="col-span-3 px-3 pb-2.5 pt-0" data-source={source}>
          {messages.map((message) => (
            <p
              className={cn(
                "m-0 text-[11.5px]",
                message.tone === "error" ? "text-red-text" : "text-fg-muted",
              )}
              key={message.key}
            >
              {message.text}
            </p>
          ))}
        </div>
      ) : null}
    </>
  );
}
