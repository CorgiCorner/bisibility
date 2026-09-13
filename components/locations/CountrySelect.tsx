"use client";

import { CountryFlag } from "@/components/keywords/CountryFlag";
import { MenuSelect, type MenuSelectOptionGroup } from "@/components/ui/MenuSelect";

// One country control for every surface that picks a country: research, domain overview and the
// market sheet. Countries the project already tracks sit in their own group above the catalog;
// everything else is one alphabetical list, visible without typing.

export type CountrySelectOption = {
  /** ISO alpha-2, the value the host stores. */
  code: string;
  disabled?: boolean;
  label: string;
  /** Only for a country the list would otherwise show twice, e.g. a second tracked language. */
  secondary?: string;
  tooltip?: string;
};

export type CountrySelectProps = {
  ariaLabel: string;
  /** Every selectable country, any order: this control sorts and groups them. */
  countries: readonly CountrySelectOption[];
  catalogLabel?: string;
  disabled?: boolean;
  menuWidth?: number;
  noResultsMessage?: string;
  onChange: (countryCode: string) => void;
  searchPlaceholder?: string;
  size?: "input" | "toolbar";
  trackedLabel?: string;
  /** Country codes the project already tracks, pinned above the catalog. */
  trackedCodes?: readonly string[];
  triggerClassName?: string;
  triggerTitle?: string;
  triggerWrapperClassName?: string;
  value: string;
};

function flagIcon(code: string) {
  return (
    <CountryFlag
      className="h-3 w-4 flex-none rounded-[2px] shadow-sm"
      code={code}
      fallback="globe"
    />
  );
}

function menuOption(country: CountrySelectOption) {
  return {
    disabled: country.disabled,
    icon: flagIcon(country.code),
    label: country.label,
    noWrap: true,
    secondary: country.secondary,
    searchText: `${country.label} ${country.code}`,
    tooltip: country.tooltip,
    value: country.code,
  };
}

function byLabel(left: CountrySelectOption, right: CountrySelectOption) {
  return left.label.localeCompare(right.label, "en");
}

export function countrySelectGroups(
  countries: readonly CountrySelectOption[],
  trackedCodes: readonly string[],
  labels: Readonly<{ catalog: string; tracked: string }>,
): MenuSelectOptionGroup[] {
  const tracked = new Set(trackedCodes.map((code) => code.trim().toUpperCase()));
  const isTracked = (country: CountrySelectOption) =>
    tracked.has(country.code.trim().toUpperCase());
  const trackedCountries = countries.filter(isTracked).sort(byLabel);
  const catalogCountries = countries.filter((country) => !isTracked(country)).sort(byLabel);
  return [
    { id: "tracked", label: labels.tracked, options: trackedCountries.map(menuOption) },
    {
      hideHeading: trackedCountries.length === 0,
      id: "catalog",
      label: labels.catalog,
      options: catalogCountries.map(menuOption),
    },
  ].filter((group) => group.options.length > 0);
}

export function CountrySelect({
  ariaLabel,
  catalogLabel = "All countries",
  countries,
  disabled,
  menuWidth,
  noResultsMessage = "No country matches this search.",
  onChange,
  searchPlaceholder = "Search countries",
  size = "toolbar",
  trackedCodes = [],
  trackedLabel = "Tracked countries",
  triggerClassName,
  triggerTitle,
  triggerWrapperClassName,
  value,
}: Readonly<CountrySelectProps>) {
  const groups = countrySelectGroups(countries, trackedCodes, {
    catalog: catalogLabel,
    tracked: trackedLabel,
  });

  return (
    <MenuSelect
      ariaLabel={ariaLabel}
      disabled={disabled}
      groups={groups}
      leadingIcon={value ? flagIcon(value) : undefined}
      menuWidth={menuWidth}
      noResultsMessage={noResultsMessage}
      onChange={onChange}
      searchPlaceholder={searchPlaceholder}
      searchable
      size={size}
      triggerClassName={triggerClassName}
      triggerTitle={triggerTitle}
      triggerWrapperClassName={triggerWrapperClassName}
      value={value}
    />
  );
}
