"use client";

import {
  DOMAIN_OVERVIEW_UNAVAILABLE_TOOLTIP,
  type DomainOverviewMarketOption,
  filterDomainOverviewMarkets,
} from "@/lib/domain-overview/market-options";
import Popover from "@mui/material/Popover";
import Tooltip from "@mui/material/Tooltip";
import {
  CaretDownIcon as CaretDown,
  CheckIcon as Check,
  GlobeIcon as Globe,
  MagnifyingGlassIcon as Search,
} from "@phosphor-icons/react";
import { type KeyboardEvent, useId, useState } from "react";
import { domainOverviewControlHeight } from "./domain-overview-control-styles";
import type { DomainOverviewMarketSelection } from "./domain-overview-workspace-model";

type DomainOverviewMarketComboboxProps = {
  catalogMarkets: readonly DomainOverviewMarketOption[];
  disabled?: boolean;
  onChange: (market: DomainOverviewMarketOption) => void;
  trackedMarkets: readonly DomainOverviewMarketOption[];
  value: DomainOverviewMarketSelection;
};

type VisibleOption = { market: DomainOverviewMarketOption; source: "catalog" | "tracked" };

function marketLabel(market: Pick<DomainOverviewMarketOption, "displayName" | "languageLabel">) {
  return `${market.displayName} / ${market.languageLabel}`;
}

function firstEnabled(options: readonly VisibleOption[]) {
  return options.findIndex(({ market }) => market.researchAvailable);
}

function focusInput(input: HTMLInputElement | null) {
  input?.focus();
}

export function DomainOverviewMarketCombobox({
  catalogMarkets,
  disabled = false,
  onChange,
  trackedMarkets,
  value,
}: Readonly<DomainOverviewMarketComboboxProps>) {
  const id = useId();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const tracked = filterDomainOverviewMarkets(trackedMarkets, query);
  const catalog = query.trim() ? filterDomainOverviewMarkets(catalogMarkets, query) : [];
  const visible: VisibleOption[] = [
    ...tracked.map((market) => ({ market, source: "tracked" as const })),
    ...catalog.map((market) => ({ market, source: "catalog" as const })),
  ];
  const open = Boolean(anchor);
  const listId = `${id}-market-listbox`;

  function close() {
    setAnchor(null);
    setQuery("");
    setActiveIndex(-1);
  }

  function openPicker(element: HTMLElement) {
    setAnchor(element);
    setActiveIndex(firstEnabled(visible));
  }

  function pick(market: DomainOverviewMarketOption) {
    if (!market.researchAvailable) return;
    onChange(market);
    close();
  }

  function moveActive(direction: 1 | -1) {
    if (visible.length === 0) return;
    const start = activeIndex < 0 ? (direction === 1 ? -1 : 0) : activeIndex;
    for (let offset = 1; offset <= visible.length; offset += 1) {
      const index = (start + direction * offset + visible.length) % visible.length;
      if (visible[index]?.market.researchAvailable) {
        setActiveIndex(index);
        return;
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter") {
      const selected = visible[activeIndex]?.market;
      if (selected?.researchAvailable) {
        event.preventDefault();
        pick(selected);
      }
      return;
    }
    if (event.key === "Escape") close();
  }

  function renderOption(item: VisibleOption, index: number) {
    const { market } = item;
    const unavailable = !market.researchAvailable;
    const tooltip = unavailable ? DOMAIN_OVERVIEW_UNAVAILABLE_TOOLTIP : market.provenance;
    const optionId = `${id}-market-option-${index}`;
    const reasonId = unavailable ? `${optionId}-reason` : undefined;
    const row = (
      <button
        aria-describedby={reasonId}
        aria-disabled={unavailable}
        aria-selected={market.canonicalKey === value.canonicalKey}
        className={`flex min-h-9 w-full items-center gap-3 rounded-[8px] px-2 py-1.5 text-left text-[13px] ${
          unavailable
            ? "cursor-not-allowed opacity-55"
            : "hover:bg-nav-active focus-visible:bg-nav-active focus-visible:outline-none"
        } ${activeIndex === index ? "bg-nav-active" : ""}`}
        id={optionId}
        key={`${item.source}:${market.canonicalKey}`}
        onClick={() => pick(market)}
        onMouseEnter={() => {
          if (!unavailable) setActiveIndex(index);
        }}
        role="option"
        type="button"
      >
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold text-fg">{market.displayName}</span>
          <span className="text-fg-muted"> / {market.languageLabel}</span>
        </span>
        <span className="w-[74px] shrink-0 text-right font-mono text-[9.5px] text-fg-muted">
          {unavailable ? "unavailable" : ""}
        </span>
        <span className="inline-flex w-3 shrink-0 justify-end">
          {market.canonicalKey === value.canonicalKey && !unavailable ? (
            <Check aria-hidden className="text-accent-text" size={12} weight="bold" />
          ) : null}
        </span>
        {unavailable ? (
          <span className="sr-only" id={reasonId}>
            {DOMAIN_OVERVIEW_UNAVAILABLE_TOOLTIP}
          </span>
        ) : null}
      </button>
    );
    return tooltip ? (
      <Tooltip key={`${item.source}:${market.canonicalKey}`} title={tooltip}>
        <span className="block">{row}</span>
      </Tooltip>
    ) : (
      row
    );
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Market: ${marketLabel(value)}`}
        className={`${domainOverviewControlHeight()} flex w-full items-center gap-2 rounded-[9px] border border-border-strong bg-bg-elev px-3 text-[13px] font-medium text-fg outline-none hover:border-accent focus-visible:border-accent disabled:opacity-55`}
        disabled={disabled}
        onClick={(event) => openPicker(event.currentTarget)}
        title="Change market - location and language"
        type="button"
      >
        <Globe aria-hidden className="shrink-0 text-fg-muted" size={14} />
        <span className="min-w-0 flex-1 truncate text-left">{marketLabel(value)}</span>
        <CaretDown aria-hidden className="shrink-0 text-fg-muted" size={11} weight="bold" />
      </button>
      <Popover
        anchorEl={anchor}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        onClose={close}
        open={open}
        slotProps={{
          paper: {
            sx: {
              backgroundColor: "var(--bg-elev)",
              border: "1px solid var(--border-strong)",
              borderRadius: "12px",
              boxShadow: "0 14px 38px color-mix(in oklab, var(--fg) 20%, transparent)",
              marginTop: "6px",
              width: 340,
            },
          },
        }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
      >
        <div className="grid max-h-[360px] gap-1 overflow-y-auto bg-bg-elev p-1.5 text-fg">
          <label className="sticky top-0 z-10 flex items-center gap-2 rounded-[8px] border border-border-strong bg-bg-sidebar px-2.5 py-1.5">
            <Search aria-hidden className="shrink-0 text-fg-muted" size={13} />
            <input
              aria-activedescendant={
                activeIndex >= 0 ? `${id}-market-option-${activeIndex}` : undefined
              }
              aria-autocomplete="list"
              aria-controls={listId}
              aria-expanded="true"
              aria-label="Search markets"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg-muted"
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setActiveIndex(-1);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search markets"
              ref={focusInput}
              role="combobox"
              value={query}
            />
          </label>
          <div aria-label="Markets" id={listId} role="listbox">
            {tracked.length > 0 ? (
              <fieldset>
                <legend
                  className="mb-1 mt-2 px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-muted"
                  id={`${id}-tracked-label`}
                >
                  Tracked markets
                </legend>
                {visible
                  .map((item, index) => ({ index, item }))
                  .filter(({ item }) => item.source === "tracked")
                  .map(({ index, item }) => renderOption(item, index))}
              </fieldset>
            ) : null}
            {catalog.length > 0 ? (
              <fieldset className="mt-1 border-border-soft border-t pt-1">
                <legend
                  className="mb-1 mt-1 px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-muted"
                  id={`${id}-catalog-label`}
                >
                  Catalog
                </legend>
                {visible
                  .map((item, index) => ({ index, item }))
                  .filter(({ item }) => item.source === "catalog")
                  .map(({ index, item }) => renderOption(item, index))}
              </fieldset>
            ) : null}
            {visible.length === 0 ? (
              <p className="m-0 px-2 py-2 text-[12.5px] text-fg-muted">
                {query.trim() ? "No market matches this search." : "Type to search the catalog."}
              </p>
            ) : null}
          </div>
        </div>
      </Popover>
    </>
  );
}
