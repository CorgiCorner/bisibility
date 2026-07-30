"use client";

import { normalizeSerpMarketName, serpMarkets } from "@/lib/serp/markets";
import { useRef, useState } from "react";

// Data layer for LocationField. Countries come from the offline SERP market
// catalog; mixed country/city suggestions come from /api/locations/search via a
// debounced, request-versioned fetch. State updates run from handlers/promises,
// not useEffect, per ENGINEERING.md.

const DEBOUNCE_MS = 180;
export const MIN_LOCATION_QUERY_LENGTH = 2;
export const EMPTY_PROVIDER_HINT_LENGTH = 3;

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
  languageLabel?: string;
  regionName?: string | null;
  cityName?: string | null;
  canonicalKey: string;
};

export type LocationSuggestion = LocationFieldValue & {
  id: string;
};

// Offline country catalog (sorted by name) keyed on ISO code.
export const countryOptions: CountryOption[] = serpMarkets
  .map((market) => ({
    code: market.google.gl.toUpperCase(),
    hl: market.language.code,
    languageLabel: market.language.label,
    name: market.name,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function countryNameForCode(code: string): string | null {
  return countryOptions.find((option) => option.code === code.toUpperCase())?.name ?? null;
}

export function countryValueForCode(code: string): LocationFieldValue | null {
  const countryCode = code.trim().toUpperCase();
  const name = countryNameForCode(countryCode);
  if (!name) {
    return null;
  }
  return {
    canonicalKey: countryCode,
    cityName: null,
    countryCode,
    displayName: name,
    hl: countryOptions.find((option) => option.code === countryCode)?.hl,
    kind: "country",
    languageLabel: countryOptions.find((option) => option.code === countryCode)?.languageLabel,
    regionName: null,
  };
}

export function countryValueForName(name: string): LocationFieldValue | null {
  const normalized = normalizeSerpMarketName(name);
  if (!normalized) {
    return null;
  }
  const option = countryOptions.find((item) => item.name === normalized);
  return option ? countryValueForCode(option.code) : null;
}

// Shape returned by GET /api/locations/search (snake_case envelope items).
type LocationSearchItem = {
  id: string;
  display_name: string;
  country_code: string;
  region_name: string | null;
  city_name: string | null;
  canonical_key: string;
  hl?: string;
  kind: "country" | "region" | "city";
  language_label?: string;
};

function toSuggestion(item: LocationSearchItem): LocationSuggestion | null {
  if (item.kind !== "country" && item.kind !== "city") {
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
    languageLabel: item.language_label,
    regionName: item.region_name,
  };
}

async function fetchLocations(
  term: string,
  projectId: string | null,
  signal: AbortSignal,
): Promise<LocationSuggestion[]> {
  const params = new URLSearchParams({ q: term });
  if (projectId) {
    params.set("project", projectId);
  }
  const response = await fetch(`/api/locations/search?${params.toString()}`, {
    headers: { accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    return [];
  }
  const body = (await response.json()) as { data?: LocationSearchItem[] };
  return (body.data ?? []).flatMap((item) => {
    const suggestion = toSuggestion(item);
    return suggestion ? [suggestion] : [];
  });
}

export type LocationSearchState = {
  lastCompletedTerm: string | null;
  loading: boolean;
  suggestions: LocationSuggestion[];
  search: (value: string) => void;
  clear: () => void;
};

/**
 * Request versioning drops stale typeahead responses; updates stay in handlers and
 * fetch continuations, not effects.
 */
export function useLocationSearch(projectId: string | null): LocationSearchState {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
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
      void fetchLocations(term, projectId, controller.signal)
        .then((hits) => {
          if (requestRef.current === requestId) {
            setSuggestions(hits);
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
