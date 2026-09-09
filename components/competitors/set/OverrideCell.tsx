"use client";

import { MenuMultiSelect } from "@/components/ui/MenuMultiSelect";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRef, useState } from "react";

type Override = { marketId: string; marketLabel: string; mode: "added" | "excluded" };
type MarketSelection = { marketIds: string[]; scopePolicy: "all_markets" | "selected_markets" };

type OverrideCellProps = {
  availableMarkets: Array<{ id: string; label: string }>;
  canEdit: boolean;
  competitorId: string;
  overrides: Override[];
  projectId: string;
  replaceMarkets: ReplaceMarketsAction;
  scopePolicy: MarketSelection["scopePolicy"];
};

export type ReplaceMarketsAction = (
  input: MarketSelection & {
    competitorId: string;
    projectId: string;
  },
) => Promise<unknown>;

export function OverrideCell({
  availableMarkets,
  canEdit,
  competitorId,
  overrides,
  projectId,
  replaceMarkets,
  scopePolicy,
}: Readonly<OverrideCellProps>) {
  const [selection, setSelection] = useState<MarketSelection>({
    marketIds: overrides.map((override) => override.marketId),
    scopePolicy,
  });
  const [message, setMessage] = useState<string | null>(null);
  const changeRevision = useRef(0);
  const confirmedSelection = useRef(selection);
  const saveQueue = useRef(Promise.resolve());
  const allSelected = selection.scopePolicy === "all_markets" && selection.marketIds.length === 0;
  const includedMarkets = availableMarkets.filter((market) =>
    selection.scopePolicy === "all_markets"
      ? !selection.marketIds.includes(market.id)
      : selection.marketIds.includes(market.id),
  );
  const label = allSelected
    ? "All markets"
    : includedMarkets.length === 0
      ? "No markets"
      : includedMarkets.length === 1
        ? includedMarkets[0].label
        : `${includedMarkets.length} markets`;

  function save(next: MarketSelection) {
    const snapshot = { ...next, marketIds: [...next.marketIds] };
    const revision = ++changeRevision.current;
    setSelection(snapshot);
    setMessage(null);
    const persist = async () => {
      if (revision !== changeRevision.current) return;
      try {
        await replaceMarkets({ ...snapshot, competitorId, projectId });
        confirmedSelection.current = snapshot;
      } catch (error: unknown) {
        changeRevision.current += 1;
        setSelection(confirmedSelection.current);
        setMessage(actionErrorMessage(error, "Markets could not be updated."));
      }
    };
    saveQueue.current = saveQueue.current.then(persist, persist);
  }

  function changeMarkets(includedIds: string[]) {
    save({
      marketIds:
        selection.scopePolicy === "all_markets"
          ? availableMarkets
              .filter((market) => !includedIds.includes(market.id))
              .map((market) => market.id)
          : includedIds,
      scopePolicy: selection.scopePolicy,
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-override-cell="">
      {canEdit ? (
        <MenuMultiSelect
          allLabel="All markets"
          allSelected={allSelected}
          ariaLabel="Competitor markets"
          minSelected={0}
          onChange={changeMarkets}
          onSelectAll={() => save({ marketIds: [], scopePolicy: "all_markets" })}
          options={availableMarkets.map((market) => ({ label: market.label, value: market.id }))}
          placeholder={label}
          searchable={availableMarkets.length > 6}
          searchPlaceholder="Search markets..."
          summary={() => label}
          triggerClassName="h-8 w-full min-w-36 max-w-56 text-[12px]"
          values={includedMarkets.map((market) => market.id)}
        />
      ) : (
        <span className="text-[12.5px] text-fg">{label}</span>
      )}
      {message ? (
        <span className="text-[11px] text-red-text" role="alert">
          {message}
        </span>
      ) : null}
    </div>
  );
}
