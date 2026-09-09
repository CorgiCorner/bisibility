"use client";

import {
  locationSearchConsumerResponseSchema,
  type NormalizedLocationSearchItem,
  normalizeLocationSearchItem,
} from "@/lib/api/locations-search-contract";
import {
  serpCountryByCode,
  serpCountryCatalog,
  serpCountryForName,
} from "@/lib/serp/country-catalog";
import { useRef, useState } from "react";

// Data layer for LocationField. Countries come from the offline SERP market
// catalog; mixed country/region/city suggestions come from /api/locations/search via a
// debounced, request-versioned fetch. State updates run from handlers/promises,
// not useEffect, per ENGINEERING.md.

const DEBOUNCE_MS = 180;
export const MIN_LOCATION_QUERY_LENGTH = 2;
export const EMPTY_LOCATION_HINT_LENGTH = 3;
let reportedInvalidSearchResponse = false;

export function resetInvalidSearchResponseReport() {
  reportedInvalidSearchResponse = false;
}

export type CountryOption = {
  /** ISO alpha-2, upper - the stored Location.countryCode. */
  code: string;
  hl: string;
  languageLabel: string;
  /** Human label / canonical market name, e.g. "United States". */
  name: string;
};

export type LocationFieldValue = {
  kind: "country" | "region" | "city";
  displayName: string;
  countryCode: string;
  hl?: string;
  languageCode?: string;
  languageLabel?: string;
  regionName?: string | null;
  cityName?: string | null;
  canonicalKey: string;
};

export type LocationSuggestion = LocationFieldValue & {
  id?: string;
};

// Offline country catalog (sorted by name) keyed on ISO code.
export const countryOptions: CountryOption[] = serpCountryCatalog
  .map((country) => ({
    code: country.countryCode,
    hl: country.languageCode,
    languageLabel: country.languageLabel,
    name: country.displayName,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function countryNameForCode(code: string): string | null {
  return serpCountryByCode(code)?.displayName ?? null;
}

export function countryValueForCode(code: string): LocationFieldValue | null {
  const countryCode = code.trim().toUpperCase();
  const country = serpCountryByCode(countryCode);
  if (!country) {
    return null;
  }
  return {
    canonicalKey: countryCode,
    cityName: null,
    countryCode,
    displayName: country.displayName,
    hl: country.languageCode,
    kind: "country",
    languageCode: country.languageCode,
    languageLabel: country.languageLabel,
    regionName: null,
  };
}

export function countryValueForName(name: string): LocationFieldValue | null {
  const country = serpCountryForName(name);
  return country ? countryValueForCode(country.countryCode) : null;
}

function toSuggestion(
  item: ReturnType<typeof normalizeLocationSearchItem>,
): LocationSuggestion | null {
  if (item.kind !== "country" && item.kind !== "region" && item.kind !== "city") {
    return null;
  }
  return {
    canonicalKey: item.canonical_key,
    cityName: item.city_name,
    countryCode: item.country_code,
    displayName: item.display_name,
    hl: item.hl,
    id: item.id,
    kind: item.kind,
    languageCode: item.language_code ?? item.hl,
    languageLabel: item.language_label,
    regionName: item.region_name,
  };
}

function reportInvalidSearchResponse() {
  if (!reportedInvalidSearchResponse) {
    console.warn("[locations] Ignoring an invalid location-search response.");
    reportedInvalidSearchResponse = true;
  }
}

export type LocationSearchRequest = {
  /** ISO alpha-2 code that scopes shared catalog locations to one country. */
  country?: string | null;
  projectId: string | null;
  signal: AbortSignal;
};

/**
 * The one client call to /api/locations/search: every typeahead in the app reads the wire contract
 * through this, so a response the contract rejects is dropped in one place.
 */
export async function fetchLocationSearchItems(
  term: string,
  { country, projectId, signal }: LocationSearchRequest,
): Promise<NormalizedLocationSearchItem[]> {
  const params = new URLSearchParams({ q: term });
  if (projectId) {
    params.set("project", projectId);
  }
  if (country) {
    params.set("country", country);
  }
  const response = await fetch(`/api/locations/search?${params.toString()}`, {
    headers: { accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    return [];
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    reportInvalidSearchResponse();
    return [];
  }
  const parsed = locationSearchConsumerResponseSchema.safeParse(body);
  if (!parsed.success) {
    reportInvalidSearchResponse();
    return [];
  }
  return parsed.data.data.map(normalizeLocationSearchItem);
}

async function fetchLocations(
  term: string,
  projectId: string | null,
  signal: AbortSignal,
): Promise<LocationSuggestion[]> {
  const items = await fetchLocationSearchItems(term, { projectId, signal });
  return items.flatMap((item) => {
    const suggestion = toSuggestion(item);
    return suggestion ? [suggestion] : [];
  });
}

export type SuggestionSearchState<T> = {
  lastCompletedTerm: string | null;
  loading: boolean;
  suggestions: T[];
  search: (value: string) => void;
  clear: () => void;
};

export type LocationSearchState = SuggestionSearchState<LocationSuggestion>;

/**
 * Request versioning drops stale typeahead responses; updates stay in handlers and
 * fetch continuations, not effects.
 */
export function useLocationSearch(projectId: string | null): LocationSearchState {
  return useSuggestionSearch((term, signal) => fetchLocations(term, projectId, signal));
}

/**
 * Debounced, abortable typeahead over any loader. `load` is read when a search starts, so a
 * host may hand in a closure over its current scope (the country a picker is mounted for).
 */
export function useSuggestionSearch<T>(
  load: (term: string, signal: AbortSignal) => Promise<readonly T[]>,
): SuggestionSearchState<T> {
  const [suggestions, setSuggestions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastCompletedTerm, setLastCompletedTerm] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);

  function clear() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    controllerRef.current?.abort();
    requestRef.current += 1;
    setSuggestions([]);
    setLoading(false);
    setLastCompletedTerm(null);
  }

  function search(value: string) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    const term = value.trim();
    if (term.length < MIN_LOCATION_QUERY_LENGTH) {
      controllerRef.current?.abort();
      requestRef.current += 1;
      setSuggestions([]);
      setLoading(false);
      setLastCompletedTerm(null);
      return;
    }
    setLoading(true);
    const requestId = ++requestRef.current;
    debounceRef.current = setTimeout(() => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      void load(term, controller.signal)
        .then((hits) => {
          if (requestRef.current === requestId) {
            setSuggestions([...hits]);
            setLoading(false);
            setLastCompletedTerm(term);
          }
        })
        .catch(() => {
          if (requestRef.current === requestId) {
            setSuggestions([]);
            setLoading(false);
            setLastCompletedTerm(term);
          }
        });
    }, DEBOUNCE_MS);
  }

  return { clear, lastCompletedTerm, loading, search, suggestions };
}
