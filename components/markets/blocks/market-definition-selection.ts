import type { MarketLocationKind } from "@/lib/markets/create-input";
import { canonicalKey, parseCanonicalKey } from "@/lib/serp/location";

// Pure helpers over a MarketDefinition value: what the block hands out is a PLACE (country, region
// or city) and a language; the market's selection key joins the two. Hosts build create input from
// the selection and never rebuild kind, name or language from a key.

export type MarketDefinitionCountry = { code: string; label: string };
export type MarketDefinitionLanguage = { code: string; label: string };
export type MarketDefinitionLocation = {
  /** The place's selection key without a language qualifier: "ES", "ES/Andalusia/Malaga". */
  canonicalKey: string;
  countryCode: string;
  /** The name the server gave the place; shown as-is, never parsed. */
  displayName: string;
  kind: MarketLocationKind;
};

export type MarketDefinitionValue = {
  countryCode: string | null;
  customName: string;
  languageCode: string | null;
  location: MarketDefinitionLocation | null;
};

export const emptyMarketDefinition: MarketDefinitionValue = {
  countryCode: null,
  customName: "",
  languageCode: null,
  location: null,
};

/** The identity a host submits: the language-qualified key plus what the form claims about it. */
export type MarketDefinitionSelection = {
  canonicalKey: string;
  countryCode: string;
  kind: MarketLocationKind;
  languageCode: string;
};

const kindLabels: Record<MarketLocationKind, string> = {
  city: "City",
  country: "Country",
  region: "Region",
};

export function locationKindLabel(kind: MarketLocationKind) {
  return kindLabels[kind];
}

/** Strips a language qualifier so two cached language variants of one place collapse to one option. */
export function baseLocationKey(key: string) {
  const selector = parseCanonicalKey(key);
  if (!selector) return key;
  const { languageCode: _languageCode, ...place } = selector;
  return canonicalKey(place);
}

/** The country itself as a place, offered without a search. */
export function countryLocation(country: MarketDefinitionCountry): MarketDefinitionLocation {
  return {
    canonicalKey: country.code,
    countryCode: country.code,
    displayName: country.label,
    kind: "country",
  };
}

export function marketDefinitionSelection(
  value: MarketDefinitionValue,
): MarketDefinitionSelection | null {
  const { countryCode, languageCode, location } = value;
  if (!countryCode || !languageCode || !location || location.countryCode !== countryCode) {
    return null;
  }
  const selector = parseCanonicalKey(location.canonicalKey);
  if (!selector) return null;
  try {
    return {
      canonicalKey: canonicalKey({ ...selector, languageCode }),
      countryCode,
      kind: location.kind,
      languageCode,
    };
  } catch {
    return null;
  }
}
