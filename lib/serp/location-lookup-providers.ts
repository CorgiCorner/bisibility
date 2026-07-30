import "server-only";

import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import type { ProviderCredentials } from "@/lib/providers/types";
import { type CityCandidate, canonicalKey, countrySeed } from "./location";

const DATAFORSEO_LOCATIONS_URL = "https://api.dataforseo.com/v3/serp/google/locations";
const SERPAPI_LOCATIONS_URL = "https://serpapi.com/locations.json";
const REQUEST_TIMEOUT_MS = 8_000;
const DATAFORSEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_LOCATION_SUGGEST_LIMIT = 10;

export type LocationSuggestion = CityCandidate & {
  canonicalKey: string;
  countryCode: string;
};

export type LocationSuggestInput = {
  query: string;
  countryCode?: string | null;
  limit?: number;
};

export type LookupOptions = { projectId?: string };
export type ScoredSuggestion = LocationSuggestion & { exactness: number; reach: number };

type DataForSeoCacheEntry = { expiresAt: number; rows: DataForSeoLocation[] };

// Process-local cache only; multi-instance/serverless deployments may still
// refetch per instance, so provider rate limiting remains the backstop.
const dataForSeoCountryCache = new Map<string, DataForSeoCacheEntry>();

export function clearLocationLookupCacheForTests() {
  dataForSeoCountryCache.clear();
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeLocationLookupName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function nameSegments(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function cityLeaf(hierarchicalName: string) {
  return nameSegments(hierarchicalName)[0] ?? hierarchicalName.trim();
}

function regionSegment(hierarchicalName: string) {
  const parts = nameSegments(hierarchicalName);
  return parts.length >= 3 ? parts.slice(1, -1).join(", ") : null;
}

function matchExactness(name: string, query: string) {
  const haystack = normalizeLocationLookupName(name);
  const needle = normalizeLocationLookupName(query);
  if (!needle) {
    return null;
  }
  if (haystack === needle) {
    return 0;
  }
  if (haystack.startsWith(needle)) {
    return 1;
  }
  return haystack.includes(needle) ? 2 : null;
}

function countryFallbackName(countryCode: string): string | null {
  return countrySeed(countryCode)?.displayName ?? null;
}

function suggestionKey(
  candidate: Pick<LocationSuggestion, "countryCode" | "regionName" | "cityName">,
) {
  return canonicalKey({
    cityName: candidate.cityName,
    countryCode: candidate.countryCode,
    regionName: candidate.regionName,
  });
}

type DataForSeoLocation = {
  location_code?: number;
  location_name?: string;
  country_iso_code?: string;
  location_type?: string;
};

type DataForSeoLocationsResponse = {
  tasks?: Array<{ result?: DataForSeoLocation[] }>;
};

function dataForSeoAuth(creds: ProviderCredentials) {
  if (!creds.login || !creds.password) {
    return null;
  }
  const userInfo = `${creds.login}:${creds.password}`;
  return `Basic ${Buffer.from(userInfo).toString("base64")}`;
}

async function fetchDataForSeoRows(
  countryCode: string,
  creds: ProviderCredentials,
  options: LookupOptions,
) {
  const auth = dataForSeoAuth(creds);
  const country = countryCode.toUpperCase();
  if (!auth || !countrySeed(country)) {
    return [];
  }
  const cached = dataForSeoCountryCache.get(country);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.rows;
  }
  const budget = await consumeProviderLimit("dataforseo", creds, { projectId: options.projectId });
  if (!budget.success) {
    return [];
  }
  const response = await fetchWithTimeout(`${DATAFORSEO_LOCATIONS_URL}/${country.toLowerCase()}`, {
    headers: { Authorization: auth },
  });
  if (!response.ok) {
    return [];
  }
  const data = (await response.json()) as DataForSeoLocationsResponse;
  const rows = data.tasks?.flatMap((task) => task.result ?? []) ?? [];
  dataForSeoCountryCache.set(country, { expiresAt: Date.now() + DATAFORSEO_CACHE_TTL_MS, rows });
  return rows;
}

export async function fetchDataForSeoSuggestions(
  input: { countryCode: string; query: string },
  creds: ProviderCredentials,
  options: LookupOptions,
): Promise<ScoredSuggestion[]> {
  const rows = await fetchDataForSeoRows(input.countryCode, creds, options);
  const fallbackName = countryFallbackName(input.countryCode);
  if (!fallbackName) {
    return [];
  }
  return rows.flatMap((row) => {
    if (row.location_type !== "City" || typeof row.location_name !== "string") {
      return [];
    }
    const cityName = cityLeaf(row.location_name);
    const exactness = matchExactness(cityName, input.query);
    if (exactness === null) {
      return [];
    }
    const candidate = {
      cityName,
      countryCode: input.countryCode,
      displayName: row.location_name,
      primaryGeoCode: typeof row.location_code === "number" ? row.location_code : null,
      primaryGeoName: row.location_name,
      regionCode: null,
      regionName: regionSegment(row.location_name),
      secondaryGeoName: fallbackName,
    };
    return [{ ...candidate, canonicalKey: suggestionKey(candidate), exactness, reach: 0 }];
  });
}

type SerpApiLocation = {
  name?: string;
  canonical_name?: string;
  country_code?: string;
  target_type?: string;
  reach?: number;
};

export async function fetchSerpApiSuggestions(
  input: { countryCode: string | null; query: string; limit: number },
  options: LookupOptions,
): Promise<ScoredSuggestion[]> {
  const budget = await consumeProviderLimit("serpapi", undefined, { projectId: options.projectId });
  if (!budget.success) {
    return [];
  }
  const url = `${SERPAPI_LOCATIONS_URL}?q=${encodeURIComponent(input.query)}&limit=${input.limit}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    return [];
  }
  const rows = (await response.json()) as unknown;
  return Array.isArray(rows) ? serpApiSuggestions(rows as SerpApiLocation[], input) : [];
}

function serpApiSuggestions(
  rows: SerpApiLocation[],
  input: { countryCode: string | null; query: string },
): ScoredSuggestion[] {
  return rows.flatMap((row) => {
    const countryCode = row.country_code?.toUpperCase() ?? "";
    if (
      row.target_type !== "City" ||
      typeof row.canonical_name !== "string" ||
      !countrySeed(countryCode) ||
      (input.countryCode && countryCode !== input.countryCode)
    ) {
      return [];
    }
    const cityName = row.name?.trim() || cityLeaf(row.canonical_name);
    const exactness = matchExactness(cityName, input.query);
    if (exactness === null) {
      return [];
    }
    const fallbackName = countryFallbackName(countryCode) ?? cityName;
    const candidate = {
      cityName,
      countryCode,
      displayName: row.canonical_name,
      primaryGeoCode: null,
      primaryGeoName: fallbackName,
      regionCode: null,
      regionName: regionSegment(row.canonical_name),
      secondaryGeoName: row.canonical_name,
    };
    return [
      { ...candidate, canonicalKey: suggestionKey(candidate), exactness, reach: row.reach ?? 0 },
    ];
  });
}
