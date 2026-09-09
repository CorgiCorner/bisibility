"use client";

import { CountryFlag } from "@/components/keywords/CountryFlag";
import { Button } from "@/components/ui/Button";
import {
  type HeaderContextMarket,
  type MarketRow,
  marketRows,
  marketSearchVisible,
} from "@/lib/markets/header-context";
import { cn } from "@/lib/ui/cn";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { GlobeHemisphereWestIcon as Globe } from "@phosphor-icons/react/dist/csr/GlobeHemisphereWest";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useId, useState } from "react";

/**
 * The row that leaves the axis rather than moving along it. It can never collide with a market:
 * every market ref is a `pmkt_` publicId.
 */
export const ALL_MARKETS_VALUE = "all-markets";

/**
 * `-mx-1.5` cancels the 6px padding of whatever holds the rule, so it runs edge to edge. Both
 * holders have to pay that padding for it to work: the dialog does, and the listbox is given it
 * back below precisely so this class means the same thing in either place.
 */
const ruleClassName = "-mx-1.5 my-1.5 block h-px flex-none bg-border";

/**
 * The scrolling list. It cancels the dialog's padding and re-applies its own, so its padding box
 * - the box `overflow` clips at - is the full width of the dialog and a full-bleed rule inside
 * it no longer has to overflow to reach the edges. Without that, `overflow-y: auto` computes
 * `overflow-x` to `auto` rather than `visible`, and the rule's negative margin is simply cut off.
 */
const listClassName =
  "-mx-1.5 flex max-h-[min(360px,60vh)] flex-col gap-1 overflow-y-auto px-1.5 outline-none";

const rowClassName =
  "flex min-h-11 w-full flex-none items-center gap-3 rounded-control px-2.5 py-2 text-left text-[13px] text-fg transition-colors hover:bg-bg-sunken active:bg-bg-inset";

export type MarketSwitcherMenuProps = Readonly<{
  markets: readonly HeaderContextMarket[];
  onAddMarket?: () => void;
  showAllMarkets?: boolean;
  onDismiss: () => void;
  onSelect: (value: string) => void;
  selectedValue: string;
}>;

type MarketOptionProps = Readonly<{
  active: boolean;
  domId: string;
  onSelect: (value: string) => void;
  row: MarketRow;
  selected: boolean;
}>;

/**
 * One row of the list. It is the option itself rather than a button inside one: a control
 * nested in an option is announced as a second, nameless stop and breaks the listbox contract.
 */
function MarketOption({ active, domId, onSelect, row, selected }: MarketOptionProps) {
  return (
    <button
      aria-selected={selected}
      className={cn(rowClassName, active && "bg-bg-sunken", selected && "font-semibold")}
      id={domId}
      onClick={() => onSelect(row.value)}
      role="option"
      // The list is one tab stop; the active row is carried by aria-activedescendant, so the
      // rows themselves must stay out of the tab order.
      tabIndex={-1}
      type="button"
    >
      <span aria-hidden className="grid h-7 w-7 flex-none place-items-center text-fg-muted">
        {row.value === ALL_MARKETS_VALUE ? (
          <Globe size={17} weight="regular" />
        ) : (
          <CountryFlag code={row.countryCode ?? ""} className="h-4 w-6 rounded-[2px]" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate" data-market-name title={row.name}>
          {row.name}
        </span>
        {row.pair ? (
          <span
            className="block truncate text-[11px] font-normal text-fg-muted"
            data-market-pair
            title={row.description ?? row.pair}
          >
            {row.description ?? row.pair}
          </span>
        ) : null}
      </span>
      {row.paused ? (
        <span className="flex-none text-[10px] font-normal text-fg-muted">Paused</span>
      ) : null}
      <span className="ml-auto flex-none tabular-nums text-[11px] text-fg-muted" data-market-count>
        {row.countLabel}
      </span>
      <span className="w-3.5 flex-none text-accent-text">
        {selected ? <Check aria-hidden size={14} weight="regular" /> : null}
      </span>
    </button>
  );
}

/**
 * Brings a row into view. Past a screenful the list scrolls, and an active row carried only by
 * `aria-activedescendant` walks off the edge: the reader is then moving a highlight they cannot
 * see, which is not a keyboard path at all.
 *
 * Every row is mounted whether or not it is active, so the node already exists while the key is
 * being handled and the scroll can happen right here - no effect, and no ref kept in step with
 * state. `nearest` makes it a nudge: a row already on screen does not move the list.
 */
function revealOption(domId: string) {
  document.getElementById(domId)?.scrollIntoView({ block: "nearest" });
}

export function MarketSwitcherMenu({
  markets,
  onAddMarket,
  onDismiss,
  onSelect,
  selectedValue,
  showAllMarkets = true,
}: MarketSwitcherMenuProps) {
  const listId = useId();
  const [search, setSearch] = useState("");
  const [requestedValue, setRequestedValue] = useState(selectedValue);

  const allMarketsRow: MarketRow = {
    countLabel: String(markets.length),
    name: "All markets",
    pair: "",
    value: ALL_MARKETS_VALUE,
  };
  const filteredMarkets = marketRows(markets, search);
  // Project pages keep the unfiltered way back; keyword details only switch tracked targets.
  const rows = showAllMarkets ? [allMarketsRow, ...filteredMarkets] : filteredMarkets;
  const values = rows.map((row) => row.value);
  // Derived, not stored: narrowing the search can drop the active row, and the first row is
  // then the honest answer. Recomputing beats an effect that reconciles two states.
  const activeValue = values.includes(requestedValue) ? requestedValue : (values[0] ?? "");
  const domIdOf = (value: string) => `${listId}-${value}`;

  // The one way the active row is allowed to move, so nothing can change it without also
  // bringing it back into view.
  function activate(next: string | undefined) {
    if (!next) return;
    setRequestedValue(next);
    revealOption(domIdOf(next));
  }

  function moveActive(delta: number) {
    const index = values.indexOf(activeValue);
    activate(values[Math.min(values.length - 1, Math.max(0, index + delta))]);
  }

  function handleListKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      activate(event.key === "Home" ? values[0] : values[values.length - 1]);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (activeValue) onSelect(activeValue);
    }
  }

  // Escape belongs to the dialog, not to the list: it has to answer from the search field and
  // from the action too, and the switcher restores focus to the trigger from there.
  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onDismiss();
  }

  const focusDialog = useCallback((node: HTMLDivElement | null) => {
    if (node && !node.contains(document.activeElement)) node.focus();
  }, []);

  return (
    <div
      aria-label="Switch market"
      className="flex w-[360px] max-w-[calc(100vw-32px)] flex-col p-1.5 outline-none"
      onKeyDown={handleDialogKeyDown}
      ref={focusDialog}
      role="dialog"
      tabIndex={-1}
    >
      {marketSearchVisible(markets.length) ? (
        <input
          aria-label="Find market"
          className="mb-1.5 h-8 flex-none rounded-control border border-border-control bg-transparent px-2 text-[13px] text-fg outline-none placeholder:text-fg-muted focus-visible:border-accent"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find market..."
          type="search"
          value={search}
        />
      ) : null}
      <div
        aria-activedescendant={activeValue ? domIdOf(activeValue) : undefined}
        aria-label="Markets"
        className={listClassName}
        onKeyDown={handleListKeyDown}
        role="listbox"
        tabIndex={0}
      >
        {showAllMarkets ? (
          <>
            <MarketOption
              active={allMarketsRow.value === activeValue}
              domId={domIdOf(allMarketsRow.value)}
              onSelect={onSelect}
              row={allMarketsRow}
              selected={selectedValue === ALL_MARKETS_VALUE}
            />
            <span aria-hidden className={ruleClassName} data-market-rule />
          </>
        ) : null}
        {filteredMarkets.map((row) => (
          <MarketOption
            active={row.value === activeValue}
            domId={domIdOf(row.value)}
            key={row.value}
            onSelect={onSelect}
            row={row}
            selected={row.value === selectedValue}
          />
        ))}
        {filteredMarkets.length === 0 ? (
          <p className="m-0 px-2 py-3 text-[12px] text-fg-muted">
            {markets.length
              ? "No market matches that."
              : "Add your first market to choose where and in which language to track keywords."}
          </p>
        ) : null}
      </div>
      {onAddMarket ? (
        <>
          <span aria-hidden className={ruleClassName} data-market-rule />
          <Button
            fullWidth
            onClick={onAddMarket}
            size="sm"
            startIcon={<Plus aria-hidden size={14} weight="regular" />}
            variant="secondary"
          >
            Add market
          </Button>
        </>
      ) : null}
    </div>
  );
}
