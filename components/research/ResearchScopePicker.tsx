"use client";

import { CountrySelect, type CountrySelectOption } from "@/components/locations/CountrySelect";
import type { ResearchScope } from "@/lib/research/scope";
import {
  countryScopes,
  researchCountryScopes,
  resolveCountryScope,
} from "@/lib/research/scope-country";

type ResearchScopePickerProps = {
  disabled?: boolean;
  onChange: (scope: ResearchScope) => void;
  scopes: readonly ResearchScope[];
  value: ResearchScope;
};

function countryOption(scope: ResearchScope): CountrySelectOption {
  return { code: scope.countryCode, label: scope.countryName };
}

/**
 * Research runs per country, so the control offers countries: the language comes from the
 * tracked scope for that country, or from the country's default. Tracked countries are pinned
 * above the catalog; the rest of the catalog is alphabetical and visible without typing.
 */
export function ResearchScopePicker({
  disabled = false,
  onChange,
  scopes,
  value,
}: Readonly<ResearchScopePickerProps>) {
  const tracked = countryScopes(scopes);
  const trackedCodes = tracked.map((scope) => scope.countryCode);
  const catalog = researchCountryScopes().filter(
    (scope) => !trackedCodes.includes(scope.countryCode),
  );
  const selectable = [...tracked, ...catalog];
  const countries = (
    selectable.some((scope) => scope.countryCode === value.countryCode)
      ? selectable
      : [...selectable, value]
  ).map(countryOption);

  function handleChange(countryCode: string) {
    const next = resolveCountryScope(countryCode, scopes);
    if (next) onChange(next);
  }

  return (
    <CountrySelect
      ariaLabel="Country"
      countries={countries}
      disabled={disabled}
      onChange={handleChange}
      trackedCodes={trackedCodes}
      triggerClassName="min-h-[34px] w-full justify-between bg-bg-elev px-3 text-[13px]"
      triggerTitle="Defaults to the country you track most"
      triggerWrapperClassName="w-full"
      value={value.countryCode}
    />
  );
}
