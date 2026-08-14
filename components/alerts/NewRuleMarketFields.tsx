"use client";

import type { AlertTargetOptions } from "@/lib/alerts/alert-data";
import type { NewRuleForm } from "@/lib/alerts/new-rule-data";
import { CheckIcon as Check } from "@phosphor-icons/react";
import type { UseFormSetValue } from "react-hook-form";

const chipClass =
  "inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-medium";

export function NewRuleMarketFields({
  marketIds,
  markets,
  setValue,
}: Readonly<{
  marketIds: string[];
  markets: AlertTargetOptions["markets"];
  setValue: UseFormSetValue<NewRuleForm>;
}>) {
  function toggle(id: string) {
    const next = marketIds.includes(id)
      ? marketIds.filter((marketId) => marketId !== id)
      : [...marketIds, id];
    setValue("marketIds", next, { shouldDirty: true, shouldValidate: true });
  }

  return (
    <section aria-label="Markets">
      <div className="mb-[9px] font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
        Markets
      </div>
      <div className="flex flex-wrap gap-[7px]">
        <button
          aria-pressed={marketIds.length === 0}
          className={`${chipClass} ${marketIds.length === 0 ? "border-accent bg-accent-soft text-fg" : "border-border-strong bg-transparent text-fg"}`}
          onClick={() => setValue("marketIds", [], { shouldDirty: true })}
          type="button"
        >
          {marketIds.length === 0 ? <Check aria-hidden size={10} weight="bold" /> : null}
          All markets
        </button>
        {markets.map((market) => {
          const selected = marketIds.includes(market.id);
          return (
            <button
              aria-pressed={selected}
              className={`${chipClass} ${selected ? "border-accent bg-accent-soft text-fg" : "border-border-strong bg-transparent text-fg"}`}
              key={market.id}
              onClick={() => toggle(market.id)}
              title={market.canonicalKey}
              type="button"
            >
              {selected ? <Check aria-hidden size={10} weight="bold" /> : null}
              {market.label}
            </button>
          );
        })}
      </div>
      <p className="m-0 mt-[9px] font-mono text-[10.5px] leading-[1.5] text-fg-muted">
        Rule fires only for checks in the selected markets.
      </p>
    </section>
  );
}

export function RulePreview({ children }: Readonly<{ children: string }>) {
  return (
    <section>
      <div className="mb-[9px] font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
        Preview
      </div>
      <div className="rounded-[11px] border border-border bg-bg-sunken px-[15px] py-3.5 text-[13.5px] leading-[1.55]">
        {children}
      </div>
    </section>
  );
}
