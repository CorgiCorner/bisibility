import "server-only";

import type { LocationSearchItem } from "@/lib/api/locations-search-contract";
import { prisma } from "@/lib/db/prisma";
import type { Location } from "@/lib/generated/prisma/client";
import type { SharedLocationSuggestion } from "@/lib/serp/common-location-catalog";
import {
  serpCountryByCode,
  serpCountryCatalog,
  serpCountryForName,
} from "@/lib/serp/country-catalog";
import { suggestKeywordLocations } from "@/lib/serp/location-service";
import { requireApiPublicId } from "./public-id";

const DEFAULT_MAX_RESULTS = 10;

export type LocationCandidate = LocationSearchItem & { id: string; kind: Location["kind"] };

function candidateId(kind: LocationCandidate["kind"], canonicalKey: string) {
  const prefix =
    kind === "country" ? "country" : kind === "region" ? "location:region" : "location";
  return `${prefix}:${canonicalKey}`;
}

function normalizeSearch(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function toSuggestionCandidate(candidate: SharedLocationSuggestion): LocationCandidate {
  const country = serpCountryByCode(candidate.countryCode);
  return {
    canonical_key: candidate.canonicalKey,
    city_name: candidate.cityName,
    country_code: candidate.countryCode,
    display_name: candidate.displayName,
    hl: country?.languageCode ?? "en",
    id: candidateId(candidate.kind, candidate.canonicalKey),
    kind: candidate.kind,
    language_code: country?.languageCode ?? "en",
    language_label: country?.languageLabel ?? "English",
    region_code: candidate.regionCode,
    region_name: candidate.regionName ?? null,
  };
}

function countryRank(haystacks: string[], query: string) {
  const needle = normalizeSearch(query);
  if (!needle) {
    return null;
  }
  const normalized = haystacks.map(normalizeSearch);
  if (normalized.includes(needle)) {
    return 0;
  }
  if (normalized.some((value) => value.startsWith(needle))) {
    return 1;
  }
  return normalized.some((value) => value.includes(needle)) ? 2 : null;
}

function countryCandidates(query: string): LocationCandidate[] {
  return serpCountryCatalog
    .flatMap((country) => {
      const rank = countryRank(
        [country.displayName, ...country.aliases, country.countryCode],
        query,
      );
      if (rank === null) {
        return [];
      }
      return [
        {
          canonical_key: country.countryCode,
          city_name: null,
          country_code: country.countryCode,
          display_name: country.displayName,
          hl: country.languageCode,
          id: candidateId("country", country.countryCode),
          kind: "country" as const,
          language_code: country.languageCode,
          language_label: country.languageLabel,
          rank,
          region_code: null,
          region_name: null,
        },
      ];
    })
    .sort((a, b) => a.rank - b.rank || a.display_name.localeCompare(b.display_name))
    .map(({ rank: _rank, ...candidate }) => candidate);
}

type CountryFilter =
  | { countryCode: null; invalid: false }
  | { countryCode: string; invalid: false }
  | { countryCode: null; invalid: true };

function countryFilter(country: string | null): CountryFilter {
  const trimmed = country?.trim();
  if (!trimmed) return { countryCode: null, invalid: false };
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const countryCode = trimmed.toUpperCase();
    return serpCountryByCode(countryCode)
      ? { countryCode, invalid: false }
      : { countryCode: null, invalid: true };
  }
  const countryCode = serpCountryForName(trimmed)?.countryCode;
  return countryCode ? { countryCode, invalid: false } : { countryCode: null, invalid: true };
}

function dedupe(candidates: LocationCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.kind}:${candidate.canonical_key}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export type LocationSearchInput = {
  query: string;
  country: string | null;
  limit?: number;
  projectId?: string | null;
};

export type LocationSearchResult = {
  candidates: LocationCandidate[];
  warning: string | null;
};

export async function locationSearchMemberProjectId(userId: string, requested: string | null) {
  if (!requested) {
    return null;
  }
  const membership = await prisma.membership.findFirst({
    select: { projectId: true },
    where: {
      userId,
      project: { publicId: requireApiPublicId(requested, "prj") },
    },
  });
  return membership?.projectId ?? null;
}

export async function searchLocations(input: LocationSearchInput): Promise<LocationSearchResult> {
  const query = input.query.trim();
  if (!query) {
    return { candidates: [], warning: null };
  }
  const limit = input.limit ?? DEFAULT_MAX_RESULTS;
  const filter = countryFilter(input.country);
  if (filter.invalid) return { candidates: [], warning: null };
  const countries = countryCandidates(query).filter(
    (candidate) => !filter.countryCode || candidate.country_code === filter.countryCode,
  );
  const suggestions = await suggestKeywordLocations({
    countryCode: filter.countryCode,
    limit,
    query,
  });

  return {
    candidates: dedupe([...countries, ...suggestions.map(toSuggestionCandidate)]).slice(0, limit),
    warning: null,
  };
}
