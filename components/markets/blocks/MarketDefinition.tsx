"use client";

import { CountrySelect } from "@/components/locations/CountrySelect";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { MenuSelect, type MenuSelectOptionGroup } from "@/components/ui/MenuSelect";
import { parseCanonicalKey } from "@/lib/serp/location";
import { useTranslations } from "next-intl";
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

export type MarketDefinitionMessages = {
  allLanguages: string;
  archived: (values: { market: string }) => string;
  country: string;
  customName: string;
  language: string;
  location: string;
  locationHint: string;
  noLocationResults: string;
  marketDefinition: string;
  marketName: string;
  searchAllLanguages: string;
  searchLocations: string;
  searchingLocations: string;
  suggested: string;
  active: (values: { market: string }) => string;
};

export function marketDefinitionMessages(
  t: ReturnType<typeof useTranslations<"projectMarkets">>,
): MarketDefinitionMessages {
  return {
    active: (values) => t("activeAlready", values),
    allLanguages: t("allLanguages"),
    archived: (values) => t("archivedAlready", values),
    country: t("country"),
    customName: t("customName"),
    language: t("language"),
    location: t("location"),
    locationHint: t("locationHint"),
    noLocationResults: t("noLocations"),
    marketDefinition: t("marketDefinition"),
    marketName: t("marketName"),
    searchAllLanguages: t("searchAllLanguages"),
    searchLocations: t("searchLocations"),
    searchingLocations: t("searchingLocations"),
    suggested: t("suggested"),
  };
}

export type MarketDefinitionProps = {
  duplicate: MarketDefinitionDuplicate | null;
  onChange: (value: MarketDefinitionValue) => void;
  registry: readonly MarketDefinitionRegistryEntry[];
  messages?: MarketDefinitionMessages;
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
  defaultLabel: string,
) {
  if (duplicate) return duplicate;
  const row = selection
    ? registry.find((entry) => entry.canonicalKey === selection.canonicalKey)
    : undefined;
  return row ? { label: defaultLabel, state: row.status } : null;
}

function languageOption(language: MarketDefinitionLanguage) {
  return { label: language.label, value: language.code };
}

/** Suggested languages are the menu; the rest of the catalog is reachable through its search. */
function languageGroups(
  messages: MarketDefinitionMessages,
  languages: ReturnType<MarketDefinitionLocationSource["languagesFor"]>,
): MenuSelectOptionGroup[] {
  const suggestedCodes = new Set(languages.suggested.map((language) => language.code));
  const others = languages.all.filter((language) => !suggestedCodes.has(language.code));
  return [
    {
      hideHeading: others.length === 0,
      id: "suggested",
      label: messages.suggested,
      options: languages.suggested.map(languageOption),
    },
    {
      id: "all",
      label: messages.allLanguages,
      options: others.map(languageOption),
      searchOnly: true,
    },
  ].filter((group) => group.options.length > 0);
}

export function MarketDefinition({
  duplicate,
  messages,
  onChange,
  registry,
  source,
  value,
}: Readonly<MarketDefinitionProps>) {
  const t = useTranslations("projectMarkets");
  const resolvedMessages = messages ?? marketDefinitionMessages(t);
  const country = source.countries.find((entry) => entry.code === value.countryCode) ?? null;
  const languages = country ? source.languagesFor(country.code) : { all: [], suggested: [] };
  const trackedCodes = registry.flatMap((entry) => {
    const selector = parseCanonicalKey(entry.canonicalKey);
    return selector ? [selector.countryCode] : [];
  });
  const countries = source.countries.map((entry) => ({ code: entry.code, label: entry.label }));
  const currentDuplicate = duplicateFor(
    duplicate,
    registry,
    marketDefinitionSelection(value),
    t("thisMarket"),
  );

  function change(partial: Partial<MarketDefinitionValue>) {
    onChange({ ...value, ...partial });
  }

  return (
    <section aria-label={resolvedMessages.marketDefinition} className="grid gap-4">
      <div className="grid gap-1.5">
        <FieldLabel label={resolvedMessages.country} />
        <CountrySelect
          ariaLabel={resolvedMessages.country}
          countries={countries}
          onChange={(countryCode) => {
            const selected = source.countries.find((entry) => entry.code === countryCode);
            change({
              countryCode,
              languageCode: null,
              location: selected ? countryLocation(selected) : null,
            });
          }}
          size="input"
          trackedCodes={trackedCodes}
          value={value.countryCode ?? ""}
        />
      </div>
      <div className="grid gap-1.5">
        <FieldLabel label={resolvedMessages.language} />
        {country ? (
          <MenuSelect
            ariaLabel={resolvedMessages.language}
            groups={languageGroups(resolvedMessages, languages)}
            onChange={(languageCode) => change({ languageCode })}
            searchable
            searchPlaceholder={resolvedMessages.searchAllLanguages}
            size="input"
            value={value.languageCode ?? ""}
          />
        ) : (
          <DisabledPicker label={resolvedMessages.language} />
        )}
      </div>
      <div className="grid gap-1.5">
        <FieldLabel label={resolvedMessages.location} />
        {country && value.languageCode ? (
          <MarketDefinitionLocationPicker
            country={country}
            key={country.code}
            messages={resolvedMessages}
            onChange={(location) => change({ location })}
            source={source}
            value={value.location}
          />
        ) : (
          <DisabledPicker label={resolvedMessages.location} />
        )}
      </div>
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="market-custom-name" label={resolvedMessages.customName} />
        <Input
          id="market-custom-name"
          maxLength={120}
          onChange={(event) => change({ customName: event.target.value })}
          placeholder={value.location?.displayName ?? resolvedMessages.marketName}
          value={value.customName}
        />
      </div>
      {currentDuplicate ? (
        <p className="m-0 text-[12px] text-fg-muted" role="alert">
          {currentDuplicate.state === "active"
            ? resolvedMessages.active({ market: currentDuplicate.label })
            : resolvedMessages.archived({ market: currentDuplicate.label })}
        </p>
      ) : null}
    </section>
  );
}
