"use client";

import { MenuSelect, type MenuSelectOption, type MenuSelectOptionGroup } from "@/components/ui";
import type { ReactNode } from "react";

export type MarketComboboxOption<T> = {
  ariaLabel?: string;
  countryCode: string;
  disabled?: boolean;
  languageCode: string;
  languageLabel: string;
  locationLabel: string;
  payload: T;
  secondary?: string;
  tooltip?: string;
  value: string;
};

export type MarketComboboxProps<T> = {
  ariaLabel: string;
  catalogLabel?: string;
  catalogMarkets: readonly MarketComboboxOption<T>[];
  catalogSearchOnly?: boolean;
  disabled?: boolean;
  emptyMessage?: string;
  leadingIcon?: ReactNode;
  menuWidth?: number;
  noResultsMessage?: string;
  onChange: (payload: T) => void;
  trackedLabel?: string;
  trackedMarkets: readonly MarketComboboxOption<T>[];
  triggerClassName?: string;
  triggerTitle?: string;
  value: string;
};

function toMenuSelectOption<T>(market: MarketComboboxOption<T>): MenuSelectOption {
  const label = market.languageLabel
    ? `${market.locationLabel} / ${market.languageLabel}`
    : market.locationLabel;
  return {
    ariaLabel: market.ariaLabel,
    disabled: market.disabled,
    label,
    secondary: market.secondary,
    searchText: `${market.locationLabel} ${market.countryCode} ${market.languageLabel} ${market.languageCode}`,
    tooltip: market.tooltip,
    value: market.value,
  };
}

export function MarketCombobox<T>({
  ariaLabel,
  catalogLabel = "Catalog",
  catalogMarkets,
  catalogSearchOnly = true,
  disabled,
  emptyMessage,
  leadingIcon,
  menuWidth,
  noResultsMessage,
  onChange,
  trackedLabel = "Tracked markets",
  trackedMarkets,
  triggerClassName,
  triggerTitle,
  value,
}: Readonly<MarketComboboxProps<T>>) {
  const trackedValues = new Set(trackedMarkets.map((market) => market.value));
  const dedupedCatalog = catalogMarkets.filter((market) => !trackedValues.has(market.value));
  const groups: MenuSelectOptionGroup[] = [];
  if (trackedMarkets.length > 0) {
    groups.push({
      id: "tracked",
      label: trackedLabel,
      options: trackedMarkets.map(toMenuSelectOption),
    });
  }
  if (dedupedCatalog.length > 0) {
    groups.push({
      id: "catalog",
      label: catalogLabel,
      options: dedupedCatalog.map(toMenuSelectOption),
      searchOnly: catalogSearchOnly,
    });
  }
  const allMarkets = [...trackedMarkets, ...dedupedCatalog];

  function handleChange(nextValue: string) {
    const market = allMarkets.find((market) => market.value === nextValue);
    if (market) onChange(market.payload);
  }

  return (
    <MenuSelect
      ariaLabel={ariaLabel}
      disabled={disabled}
      emptyMessage={emptyMessage}
      groups={groups}
      leadingIcon={leadingIcon}
      menuWidth={menuWidth}
      noResultsMessage={noResultsMessage}
      onChange={handleChange}
      searchPlaceholder="Search markets..."
      searchable
      triggerClassName={triggerClassName}
      triggerTitle={triggerTitle}
      value={value}
    />
  );
}
