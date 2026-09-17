"use client";

import { CountryFlag } from "@/components/keywords/CountryFlag";
import { MenuSelect, type MenuSelectOptionGroup } from "@/components/ui/MenuSelect";
import { useLocale, useTranslations } from "next-intl";

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

const ENGLISH_LOCALE = "en";

function flagIcon(code: string) {
  return (
    <CountryFlag
      className="h-3 w-4 flex-none rounded-[2px] shadow-sm"
      code={code}
      fallback="globe"
    />
  );
}

function displayNameForLocale(country: CountrySelectOption, locale: string): string {
  const code = country.code.trim().toUpperCase();
  try {
    const english = new Intl.DisplayNames([ENGLISH_LOCALE], { type: "region" }).of(code);
    if (!english || english === code || country.label !== english) return country.label;
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? country.label;
  } catch {
    return country.label;
  }
}

function menuOption(country: CountrySelectOption, locale: string) {
  const label = displayNameForLocale(country, locale);
  return {
    disabled: country.disabled,
    icon: flagIcon(country.code),
    label,
    noWrap: true,
    secondary: country.secondary,
    searchText: `${label} ${country.label} ${country.code}`,
    tooltip: country.tooltip,
    value: country.code,
  };
}

export function countrySelectGroups(
  countries: readonly CountrySelectOption[],
  trackedCodes: readonly string[],
  labels: Readonly<{ catalog: string; tracked: string }>,
  locale = "en",
): MenuSelectOptionGroup[] {
  const tracked = new Set(trackedCodes.map((code) => code.trim().toUpperCase()));
  const isTracked = (country: CountrySelectOption) =>
    tracked.has(country.code.trim().toUpperCase());
  const byLabel = (left: CountrySelectOption, right: CountrySelectOption) =>
    displayNameForLocale(left, locale).localeCompare(displayNameForLocale(right, locale), locale);
  const trackedCountries = countries.filter(isTracked).sort(byLabel);
  const catalogCountries = countries.filter((country) => !isTracked(country)).sort(byLabel);
  return [
    {
      id: "tracked",
      label: labels.tracked,
      options: trackedCountries.map((country) => menuOption(country, locale)),
    },
    {
      hideHeading: trackedCountries.length === 0,
      id: "catalog",
      label: labels.catalog,
      options: catalogCountries.map((country) => menuOption(country, locale)),
    },
  ].filter((group) => group.options.length > 0);
}

export function CountrySelect({
  ariaLabel,
  catalogLabel,
  countries,
  disabled,
  menuWidth,
  noResultsMessage,
  onChange,
  searchPlaceholder,
  size = "toolbar",
  trackedCodes = [],
  trackedLabel,
  triggerClassName,
  triggerTitle,
  triggerWrapperClassName,
  value,
}: Readonly<CountrySelectProps>) {
  const locale = useLocale();
  const t = useTranslations("shared.controls.countrySelect");
  const groups = countrySelectGroups(
    countries,
    trackedCodes,
    {
      catalog: catalogLabel ?? t("catalog"),
      tracked: trackedLabel ?? t("tracked"),
    },
    locale,
  );

  return (
    <MenuSelect
      ariaLabel={ariaLabel}
      disabled={disabled}
      groups={groups}
      leadingIcon={value ? flagIcon(value) : undefined}
      menuWidth={menuWidth}
      noResultsMessage={noResultsMessage ?? t("noResults")}
      onChange={onChange}
      searchPlaceholder={searchPlaceholder ?? t("searchPlaceholder")}
      searchable
      size={size}
      triggerClassName={triggerClassName}
      triggerTitle={triggerTitle}
      triggerWrapperClassName={triggerWrapperClassName}
      value={value}
    />
  );
}
