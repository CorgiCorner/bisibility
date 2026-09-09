"use client";

import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { MenuSelect, type MenuSelectOptionGroup } from "@/components/ui/MenuSelect";
import { parseCanonicalKey } from "@/lib/serp/location";
import { MarketDefinitionLocationPicker } from "./MarketDefinitionLocationPicker";
import {
  countryLocation,
  type MarketDefinitionLanguage,
  type MarketDefinitionSelection,
  type MarketDefinitionValue,
  marketDefinitionSelection,
} from "./market-definition-selection";
import type { MarketDefinitionLocationSource } from "./market-definition-source";

export type {
  MarketDefinitionCountry,
  MarketDefinitionLanguage,
  MarketDefinitionLocation,
  MarketDefinitionSelection,
  MarketDefinitionValue,
} from "./market-definition-selection";
export type { MarketDefinitionLocationSource } from "./market-definition-source";

export type MarketDefinitionRegistryEntry = {
  /** The market's language-qualified selection key, the identity a new selection is checked against. */
  canonicalKey: string;
  id: string;
  status: "active" | "archived";
};
export type MarketDefinitionDuplicate = { label: string; state: "active" | "archived" };

export type MarketDefinitionProps = {
  duplicate: MarketDefinitionDuplicate | null;
  onChange: (value: MarketDefinitionValue) => void;
  registry: readonly MarketDefinitionRegistryEntry[];
  /** Countries, languages and places; the block never queries on its own. */
  source: MarketDefinitionLocationSource;
  value: MarketDefinitionValue;
};

function DisabledPicker({ label }: Readonly<{ label: string }>) {
  return (
    <MenuSelect
      ariaLabel={label}
      disabled
      onChange={() => {}}
      options={[]}
      selectedContent={() => label}
      size="input"
      value=""
    />
  );
}

function duplicateFor(
  duplicate: MarketDefinitionDuplicate | null,
  registry: readonly MarketDefinitionRegistryEntry[],
  selection: MarketDefinitionSelection | null,
) {
  if (duplicate) return duplicate;
  const row = selection
    ? registry.find((entry) => entry.canonicalKey === selection.canonicalKey)
    : undefined;
  return row ? { label: "This market", state: row.status } : null;
}

function languageOption(language: MarketDefinitionLanguage) {
  return { label: language.label, value: language.code };
}

/** Suggested languages are the menu; the rest of the catalog is reachable through its search. */
function languageGroups(
  languages: ReturnType<MarketDefinitionLocationSource["languagesFor"]>,
): MenuSelectOptionGroup[] {
  const suggestedCodes = new Set(languages.suggested.map((language) => language.code));
  const others = languages.all.filter((language) => !suggestedCodes.has(language.code));
  return [
    {
      hideHeading: others.length === 0,
      id: "suggested",
      label: "Suggested",
      options: languages.suggested.map(languageOption),
    },
    { id: "all", label: "All languages", options: others.map(languageOption), searchOnly: true },
  ].filter((group) => group.options.length > 0);
}

export function MarketDefinition({
  duplicate,
  onChange,
  registry,
  source,
  value,
}: Readonly<MarketDefinitionProps>) {
  const country = source.countries.find((entry) => entry.code === value.countryCode) ?? null;
  const languages = country ? source.languagesFor(country.code) : { all: [], suggested: [] };
  const suggestedCodes = new Set([
    ...registry.flatMap((entry) => {
      const selector = parseCanonicalKey(entry.canonicalKey);
      return selector ? [selector.countryCode] : [];
    }),
    ...(value.countryCode ? [value.countryCode] : []),
  ]);
  const countryOptions = source.countries.map((entry) => ({
    label: entry.label,
    value: entry.code,
  }));
  const suggestedCountries = countryOptions.filter((entry) => suggestedCodes.has(entry.value));
  const countryGroups = [
    { id: "suggested", label: "Suggested", options: suggestedCountries },
    {
      hideHeading: suggestedCountries.length === 0,
      id: "all",
      label: "All countries",
      options: countryOptions.filter((entry) => !suggestedCodes.has(entry.value)),
      searchOnly: suggestedCountries.length > 0,
    },
  ];
  const currentDuplicate = duplicateFor(duplicate, registry, marketDefinitionSelection(value));

  function change(partial: Partial<MarketDefinitionValue>) {
    onChange({ ...value, ...partial });
  }

  return (
    <section aria-label="Market definition" className="grid gap-4">
      <div className="grid gap-1.5">
        <FieldLabel label="Country" />
        <MenuSelect
          ariaLabel="Country"
          groups={countryGroups}
          onChange={(countryCode) => {
            const selected = source.countries.find((entry) => entry.code === countryCode);
            change({
              countryCode,
              languageCode: null,
              location: selected ? countryLocation(selected) : null,
            });
          }}
          searchable
          searchPlaceholder="Search countries"
          size="input"
          value={value.countryCode ?? ""}
        />
      </div>
      <div className="grid gap-1.5">
        <FieldLabel label="Language" />
        {country ? (
          <MenuSelect
            ariaLabel="Language"
            groups={languageGroups(languages)}
            onChange={(languageCode) => change({ languageCode })}
            searchable
            searchPlaceholder="Search all languages"
            size="input"
            value={value.languageCode ?? ""}
          />
        ) : (
          <DisabledPicker label="Language" />
        )}
      </div>
      <div className="grid gap-1.5">
        <FieldLabel label="Location" />
        {country && value.languageCode ? (
          <MarketDefinitionLocationPicker
            country={country}
            key={country.code}
            onChange={(location) => change({ location })}
            source={source}
            value={value.location}
          />
        ) : (
          <DisabledPicker label="Location" />
        )}
      </div>
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="market-custom-name" label="Custom name (optional)" />
        <Input
          id="market-custom-name"
          maxLength={120}
          onChange={(event) => change({ customName: event.target.value })}
          placeholder={value.location?.displayName ?? "Market name"}
          value={value.customName}
        />
      </div>
      {currentDuplicate ? (
        <p className="m-0 text-[12px] text-fg-muted" role="alert">
          {currentDuplicate.state === "active"
            ? `${currentDuplicate.label} is already active.`
            : `${currentDuplicate.label} was archived. Restore it from Markets before using it.`}
        </p>
      ) : null}
    </section>
  );
}
