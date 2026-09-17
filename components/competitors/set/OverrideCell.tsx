"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { presentSafeActionError } from "@/components/keywords/safe-action-error";
import { MenuMultiSelect } from "@/components/ui/MenuMultiSelect";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("projectCompetitors.ui");
  const sharedErrors = useSharedErrorMessages();
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
    ? t("allMarkets")
    : includedMarkets.length === 0
      ? t("noMarkets")
      : includedMarkets.length === 1
        ? includedMarkets[0].label
        : t("markets", { count: includedMarkets.length });

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
        setMessage(presentSafeActionError(error, sharedErrors, t("marketsUpdateError")));
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
          allLabel={t("allMarkets")}
          allSelected={allSelected}
          ariaLabel={t("competitorMarkets")}
          minSelected={0}
          onChange={changeMarkets}
          onSelectAll={() => save({ marketIds: [], scopePolicy: "all_markets" })}
          options={availableMarkets.map((market) => ({ label: market.label, value: market.id }))}
          placeholder={label}
          searchable={availableMarkets.length > 6}
          searchPlaceholder={t("searchMarkets")}
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
