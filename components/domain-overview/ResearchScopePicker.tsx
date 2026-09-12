"use client";

import { CountrySelect, type CountrySelectOption } from "@/components/locations/CountrySelect";
import { domainOverviewUnavailableMessage } from "@/lib/domain-overview/scope-options";
import type { ResearchScope } from "@/lib/research/scope";
import { countryScopes, resolveCountryScope } from "@/lib/research/scope-country";

type ResearchScopePickerProps = {
  ariaLabel: string;
  catalogScopes: readonly ResearchScope[];
  disabled?: boolean;
  onChange: (scope: ResearchScope) => void;
  researchScope: ResearchScope;
  trackedScopes: readonly ResearchScope[];
  triggerClassName?: string;
  triggerTitle: string;
  triggerWrapperClassName?: string;
};

function countryOption(scope: ResearchScope): CountrySelectOption {
  return {
    code: scope.countryCode,
    disabled: !scope.researchAvailable,
    label: scope.countryName,
    secondary: scope.researchAvailable ? undefined : "unavailable",
    tooltip: scope.researchAvailable ? undefined : domainOverviewUnavailableMessage(scope),
  };
}

/**
 * The country a report is run for. The provider's catalogs are country level, so the language is
 * resolved from the tracked scope or the country default and never asked for here.
 */
export function ResearchScopePicker({
  ariaLabel,
  catalogScopes,
  disabled,
  onChange,
  researchScope,
  trackedScopes,
  triggerClassName,
  triggerTitle,
  triggerWrapperClassName,
}: Readonly<ResearchScopePickerProps>) {
  const tracked = countryScopes(trackedScopes);
  const trackedCodes = tracked.map((scope) => scope.countryCode);
  const catalog = countryScopes(catalogScopes).filter(
    (scope) => !trackedCodes.includes(scope.countryCode),
  );
  const selectable = [...tracked, ...catalog];
  const countries = (
    selectable.some((scope) => scope.countryCode === researchScope.countryCode)
      ? selectable
      : [...selectable, researchScope]
  ).map(countryOption);

  function handleChange(countryCode: string) {
    const next = resolveCountryScope(countryCode, [...trackedScopes, ...catalogScopes]);
    if (next) onChange(next);
  }

  return (
    <CountrySelect
      ariaLabel={ariaLabel}
      countries={countries}
      disabled={disabled}
      menuWidth={340}
      onChange={handleChange}
      trackedCodes={trackedCodes}
      triggerClassName={triggerClassName}
      triggerTitle={triggerTitle}
      triggerWrapperClassName={triggerWrapperClassName}
      value={researchScope.countryCode}
    />
  );
}
