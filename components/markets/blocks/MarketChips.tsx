"use client";

import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";

export type MarketChip = {
  id: string;
  label: string;
  researchAvailable: boolean;
  status: "active" | "paused" | "removed";
};

export type MarketChipsProps = {
  capability: "scoping" | "selection";
  markets: readonly MarketChip[];
  onChange: (selected: string[]) => void;
  onNew?: () => void;
  selected: readonly string[];
};

export function MarketChips({
  capability,
  markets,
  onChange,
  onNew,
  selected,
}: Readonly<MarketChipsProps>) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  return (
    <section aria-label="Markets" className="flex flex-wrap gap-2">
      {markets
        .filter((market) => market.status !== "removed")
        .map((market) => {
          const selectedMarket = selected.includes(market.id);
          return (
            <button
              aria-label={market.label}
              aria-pressed={selectedMarket}
              className="inline-flex min-h-[30px] items-center gap-1.5 rounded-full border border-border px-2.5 text-[12px] font-medium text-fg-muted"
              key={market.id}
              onClick={() => toggle(market.id)}
              type="button"
            >
              {selectedMarket ? <Check aria-hidden size={10} weight="regular" /> : null}
              <span>{market.label}</span>
              {!market.researchAvailable ? <span className="text-[10px]">no volume/KD</span> : null}
              {market.status === "paused" ? (
                <span className="text-[9px]">{market.status.toUpperCase()}</span>
              ) : null}
            </button>
          );
        })}
      {capability === "selection" && onNew ? (
        <button
          className="inline-flex min-h-[30px] items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-[12px] text-fg-muted"
          onClick={onNew}
          type="button"
        >
          <Plus aria-hidden size={11} weight="regular" /> New market
        </button>
      ) : null}
    </section>
  );
}
