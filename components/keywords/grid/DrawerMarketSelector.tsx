"use client";

import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { useId } from "react";

type DrawerMarketSelectorProps = {
  currentKey: string;
  currentLabel: string;
  error?: string;
  markets: ProjectMarketsView["markets"];
  onChange: (canonicalKey: string) => void;
};

function label(market: ProjectMarketsView["markets"][number]) {
  return `${market.displayName} / ${market.languageLabel}`;
}

export function DrawerMarketSelector({
  currentKey,
  currentLabel,
  error,
  markets,
  onChange,
}: Readonly<DrawerMarketSelectorProps>) {
  const id = useId();
  const currentInRegistry = markets.some((market) => market.canonicalKey === currentKey);
  return (
    <div className="flex flex-col gap-1.5 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
      <label htmlFor={id}>Market</label>
      <select
        aria-label="Market"
        className="min-h-10 w-full rounded-lg border border-border-strong bg-transparent px-3 text-[13px] font-medium normal-case tracking-normal text-fg"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={currentKey}
      >
        {!currentInRegistry ? (
          <option value={currentKey}>{`${currentLabel} - no longer in registry`}</option>
        ) : null}
        {markets.map((market) => (
          <option disabled={market.status !== "active"} key={market.id} value={market.canonicalKey}>
            {market.status === "active" ? label(market) : `${label(market)} - paused`}
          </option>
        ))}
      </select>
      {error ? <span className="normal-case tracking-normal text-red-text">{error}</span> : null}
    </div>
  );
}
