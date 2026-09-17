"use client";

import { useSuggestionSearch } from "@/components/keywords/location-picker-data";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import type { MarketDefinitionMessages } from "./MarketDefinition";
import {
  countryLocation,
  locationKindLabel,
  type MarketDefinitionCountry,
  type MarketDefinitionLocation,
} from "./market-definition-selection";
import type { MarketDefinitionLocationSource } from "./market-definition-source";

type MarketDefinitionLocationPickerProps = {
  country: MarketDefinitionCountry;
  messages: MarketDefinitionMessages;
  onChange: (location: MarketDefinitionLocation) => void;
  source: MarketDefinitionLocationSource;
  value: MarketDefinitionLocation | null;
};

function option(location: MarketDefinitionLocation): MenuSelectOption {
  const kind = locationKindLabel(location.kind);
  return {
    ariaLabel: `${location.displayName} (${kind})`,
    label: location.displayName,
    secondary: kind,
    value: location.canonicalKey,
  };
}

/**
 * The place picker of a MarketDefinition, mounted for exactly one country: the host keys it on the
 * country code, so a country switch discards the search and its results with the component. The
 * country itself is always the first choice; regions and cities arrive from the source as the
 * reader types, each labelled with its type.
 */
export function MarketDefinitionLocationPicker({
  country,
  messages,
  onChange,
  source,
  value,
}: Readonly<MarketDefinitionLocationPickerProps>) {
  const { lastCompletedTerm, loading, search, suggestions } =
    useSuggestionSearch<MarketDefinitionLocation>((term, signal) =>
      source.searchLocations(term, country.code, signal),
    );
  const whole = countryLocation(country);
  const places = [
    whole,
    ...(value && value.kind !== "country" ? [value] : []),
    ...suggestions.filter((place) => place.canonicalKey !== whole.canonicalKey),
  ].filter(
    (place, index, all) =>
      all.findIndex((item) => item.canonicalKey === place.canonicalKey) === index,
  );

  return (
    <MenuSelect
      ariaLabel={messages.location}
      filterOptions={false}
      noResultsMessage={
        loading || lastCompletedTerm === null
          ? messages.searchingLocations
          : messages.noLocationResults
      }
      onChange={(key) => {
        const picked = places.find((place) => place.canonicalKey === key);
        if (picked) onChange(picked);
      }}
      onSearchChange={search}
      options={places.map(option)}
      searchable
      searchHint={messages.locationHint}
      searchPlaceholder={messages.searchLocations}
      size="input"
      value={value?.canonicalKey ?? ""}
    />
  );
}
