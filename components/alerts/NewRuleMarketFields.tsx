"use client";

import type { AlertTargetOptions } from "@/lib/alerts/alert-data";
import type { NewRuleForm } from "@/lib/alerts/new-rule-data";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { useTranslations } from "next-intl";
import type { UseFormSetValue } from "react-hook-form";

const chipClass =
  "inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-medium";

export function ruleMarketScopeLabel(
  marketIds: readonly string[],
  markets: AlertTargetOptions["markets"],
  messages: Readonly<{ allMarkets: string; marketCount: (count: number) => string }>,
) {
  if (!marketIds.length) return messages.allMarkets;
  const selectedLabels = marketIds
    .map((marketId) => markets.find((market) => market.id === marketId)?.label)
    .filter((label): label is string => Boolean(label));
  return selectedLabels.length === 1 ? selectedLabels[0] : messages.marketCount(marketIds.length);
}

export function NewRuleMarketFields({
  marketIds,
  markets,
  setValue,
}: Readonly<{
  marketIds: string[];
  markets: AlertTargetOptions["markets"];
  setValue: UseFormSetValue<NewRuleForm>;
}>) {
  const t = useTranslations("projectAlerts.drawer");
  const scopeLabel = ruleMarketScopeLabel(marketIds, markets, {
    allMarkets: t("allMarkets"),
    marketCount: (count) => t("marketCount", { count }),
  });

  function toggle(id: string) {
    const next = marketIds.includes(id)
      ? marketIds.filter((marketId) => marketId !== id)
      : [...marketIds, id];
    setValue("marketIds", next, { shouldDirty: true, shouldValidate: true });
  }

  return (
    <section aria-label={t("marketsAria")}>
      <div className="mb-[9px] font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
        {t("markets")}
      </div>
      <div className="flex flex-wrap gap-[7px]">
        <button
          aria-pressed={marketIds.length === 0}
          className={`${chipClass} ${marketIds.length === 0 ? "border-accent bg-accent-soft text-fg" : "border-border-control bg-transparent text-fg"}`}
          onClick={() => setValue("marketIds", [], { shouldDirty: true })}
          type="button"
        >
          {marketIds.length === 0 ? <Check aria-hidden size={10} weight="regular" /> : null}
          {t("allMarkets")}
        </button>
        {markets.map((market) => {
          const selected = marketIds.includes(market.id);
          return (
            <button
              aria-pressed={selected}
              className={`${chipClass} ${selected ? "border-accent bg-accent-soft text-fg" : "border-border-control bg-transparent text-fg"}`}
              key={market.id}
              onClick={() => toggle(market.id)}
              title={market.canonicalKey}
              type="button"
            >
              {selected ? <Check aria-hidden size={10} weight="regular" /> : null}
              {market.label}
            </button>
          );
        })}
      </div>
      <p className="m-0 mt-[9px] font-sans tabular-nums text-[10.5px] leading-[1.5] text-fg-muted">
        {t("marketScope", { scope: scopeLabel })}
      </p>
    </section>
  );
}

export function RulePreview({ children }: Readonly<{ children: string }>) {
  const t = useTranslations("projectAlerts.drawer");

  return (
    <section>
      <div className="mb-[9px] font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
        {t("preview")}
      </div>
      <div className="rounded-control border border-border bg-bg-sunken px-[15px] py-3.5 text-[13.5px] leading-[1.55]">
        {children}
      </div>
    </section>
  );
}
