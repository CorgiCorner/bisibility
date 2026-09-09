"use client";

import { CountryFlag } from "@/components/keywords/CountryFlag";
import { MenuSelect, type MenuSelectOptionGroup } from "@/components/ui/MenuSelect";
import { domainOverviewUnavailableMessage } from "@/lib/domain-overview/scope-options";
import { type ResearchScope, researchScopeKey } from "@/lib/research/scope";

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

function scopeOption(scope: ResearchScope) {
  return {
    disabled: !scope.researchAvailable,
    icon: (
      <CountryFlag
        className="h-3 w-4 flex-none rounded-[2px] shadow-sm"
        code={scope.countryCode}
        fallback="globe"
      />
    ),
    label: `${scope.countryName} / ${scope.languageLabel}`,
    secondary: scope.researchAvailable ? undefined : "unavailable",
    searchText: `${scope.countryName} ${scope.countryCode} ${scope.languageLabel} ${scope.languageCode}`,
    tooltip: scope.researchAvailable ? undefined : domainOverviewUnavailableMessage(scope),
    value: researchScopeKey(scope),
  };
}

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
  const trackedKeys = new Set(trackedScopes.map(researchScopeKey));
  const catalogOnly = catalogScopes.filter((scope) => !trackedKeys.has(researchScopeKey(scope)));
  const allScopes = [...trackedScopes, ...catalogOnly];
  const groups: MenuSelectOptionGroup[] = [];
  if (trackedScopes.length > 0) {
    groups.push({
      id: "tracked",
      label: "Tracked countries and languages",
      options: trackedScopes.map(scopeOption),
    });
  }
  if (catalogOnly.length > 0) {
    groups.push({
      id: "catalog",
      label: "Countries and languages",
      options: catalogOnly.map(scopeOption),
      searchOnly: true,
    });
  }

  function handleChange(value: string) {
    const next = allScopes.find((scope) => researchScopeKey(scope) === value);
    if (next) onChange(next);
  }

  return (
    <MenuSelect
      ariaLabel={ariaLabel}
      disabled={disabled}
      emptyMessage="Type to search countries and languages."
      groups={groups}
      leadingIcon={
        <CountryFlag
          className="h-3 w-4 flex-none rounded-[2px] shadow-sm"
          code={researchScope.countryCode}
          fallback="globe"
        />
      }
      menuWidth={340}
      noResultsMessage="No country and language matches this search."
      onChange={handleChange}
      searchPlaceholder="Search countries and languages..."
      searchable
      triggerClassName={triggerClassName}
      triggerTitle={triggerTitle}
      triggerWrapperClassName={triggerWrapperClassName}
      value={researchScopeKey(researchScope)}
    />
  );
}
