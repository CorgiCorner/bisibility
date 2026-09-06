"use client";

import { Button } from "@/components/ui";
import {
  type HeaderContextMarket,
  type MarketRow,
  marketRows,
  marketSearchVisible,
} from "@/lib/markets/header-context";
import { cn } from "@/lib/ui/cn";
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
const listClassName = "-mx-1.5 flex max-h-[260px] flex-col overflow-y-auto px-1.5 outline-none";

const rowClassName =
  "flex h-8 w-full flex-none items-center gap-2 rounded-control px-2 text-left text-[13px] text-fg transition-colors hover:bg-bg-sunken";

export type MarketSwitcherMenuProps = Readonly<{
  markets: readonly HeaderContextMarket[];
  onAddMarket: () => void;
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
      <span className="min-w-0 truncate" data-market-name>
        {row.name}
      </span>
      {row.pair ? (
        <span className="flex-none text-[11px] text-fg-muted" data-market-pair>
          {row.pair}
        </span>
      ) : null}
      <span className="ml-auto flex-none tabular-nums text-[11px] text-fg-muted" data-market-count>
        {row.countLabel}
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
}: MarketSwitcherMenuProps) {
  const listId = useId();
  const [search, setSearch] = useState("");
  const [requestedValue, setRequestedValue] = useState(selectedValue);

  // `All markets` is never filtered out: it is the way back to the project level, and a search
  // that hides it would strand the reader inside a market they cannot name.
  const rows: MarketRow[] = [
    { countLabel: String(markets.length), name: "All markets", pair: "", value: ALL_MARKETS_VALUE },
    ...marketRows(markets, search),
  ];
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
      className="flex w-[290px] max-w-[calc(100vw-32px)] flex-col p-1.5 outline-none"
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
        <MarketOption
          active={rows[0].value === activeValue}
          domId={domIdOf(rows[0].value)}
          onSelect={onSelect}
          row={rows[0]}
          selected={false}
        />
        <span aria-hidden className={ruleClassName} data-market-rule />
        {rows.slice(1).map((row) => (
          <MarketOption
            active={row.value === activeValue}
            domId={domIdOf(row.value)}
            key={row.value}
            onSelect={onSelect}
            row={row}
            selected={row.value === selectedValue}
          />
        ))}
        {rows.length === 1 ? (
          <p className="m-0 px-2 py-3 text-[12px] text-fg-muted">No market matches that.</p>
        ) : null}
      </div>
      <span aria-hidden className={ruleClassName} data-market-rule />
      <Button fullWidth onClick={onAddMarket} size="sm" variant="secondary">
        Add market
      </Button>
    </div>
  );
}
