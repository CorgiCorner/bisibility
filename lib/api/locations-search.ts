import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Location, Prisma } from "@/lib/generated/prisma/client";
import { countryCodeForMarketName, countrySeed } from "@/lib/serp/location";
import type { LocationSuggestion } from "@/lib/serp/location-lookup";
import { suggestKeywordLocations } from "@/lib/serp/location-service";
import { serpMarkets } from "@/lib/serp/markets";
import { requireApiPublicId } from "./public-id";

const DEFAULT_MAX_RESULTS = 10;
const MIN_PROVIDER_QUERY_LENGTH = 3;
const MIN_CACHE_CITY_HITS = 3;

export type LocationCandidate = {
  kind: Location["kind"];
  display_name: string;
  country_code: string;
  region_code: string | null;
  region_name: string | null;
  city_name: string | null;
  canonical_key: string;
  hl: string;
  language_label: string;
};

function normalizeSearch(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function regionNameFromDisplayName(value: string) {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length >= 3 ? parts.slice(1, -1).join(", ") : null;
}

function toCacheCandidate(row: Location): LocationCandidate {
  return {
    canonical_key: row.canonicalKey,
    city_name: row.cityName,
    country_code: row.countryCode,
    display_name: row.displayName,
    hl: row.hl,
    kind: row.kind,
    language_label: row.languageLabel,
    region_code: row.regionCode,
    region_name: row.kind === "city" ? regionNameFromDisplayName(row.displayName) : null,
  };
}

function toSuggestionCandidate(candidate: LocationSuggestion): LocationCandidate {
  const seed = countrySeed(candidate.countryCode);
  return {
    canonical_key: candidate.canonicalKey,
    city_name: candidate.cityName,
    country_code: candidate.countryCode,
    display_name: candidate.displayName,
    hl: seed?.hl ?? "en",
    kind: "city",
    language_label: seed?.languageLabel ?? "English",
    region_code: candidate.regionCode,
    region_name: candidate.regionName ?? regionNameFromDisplayName(candidate.displayName),
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
  return serpMarkets
    .flatMap((market) => {
      const countryCode = market.google.gl.toUpperCase();
      const rank = countryRank([market.name, ...market.aliases, countryCode], query);
      if (rank === null) {
        return [];
      }
      return [
        {
          canonical_key: countryCode,
          city_name: null,
          country_code: countryCode,
          display_name: market.name,
          hl: market.language.code,
          kind: "country" as const,
          language_label: market.language.label,
          rank,
          region_code: null,
          region_name: null,
        },
      ];
    })
    .sort((a, b) => a.rank - b.rank || a.display_name.localeCompare(b.display_name))
    .map(({ rank: _rank, ...candidate }) => candidate);
}

function countryFilter(country: string | null): string | null {
  if (!country) {
    return null;
  }
  const trimmed = country.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return countryCodeForMarketName(trimmed);
}

function cacheWhere(query: string, countryCode: string | null): Prisma.LocationWhereInput {
  const where: Prisma.LocationWhereInput = {
    kind: "city",
    OR: [
      { displayName: { contains: query, mode: "insensitive" } },
      { cityName: { contains: query, mode: "insensitive" } },
    ],
  };
  if (countryCode) {
    where.countryCode = countryCode;
  }
  return where;
}

async function searchCache(query: string, countryCode: string | null, limit: number) {
  const rows = await prisma.location.findMany({
    orderBy: [{ displayName: "asc" }],
    take: limit,
    where: cacheWhere(query, countryCode),
  });
  return rows.map(toCacheCandidate);
}

function dedupe(candidates: LocationCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.canonical_key)) {
      return false;
    }
    seen.add(candidate.canonical_key);
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
  const countryCode = countryFilter(input.country);
  const countries = countryCandidates(query);
  const cachedCities = await searchCache(query, countryCode, limit);
  let cities = cachedCities;

  if (
    input.projectId &&
    query.length >= MIN_PROVIDER_QUERY_LENGTH &&
    cities.length < MIN_CACHE_CITY_HITS
  ) {
    try {
      const suggestions = await suggestKeywordLocations({
        countryCode: countryCode && countrySeed(countryCode) ? countryCode : null,
        limit,
        projectId: input.projectId,
        query,
      });
      cities = dedupe([...cities, ...suggestions.map(toSuggestionCandidate)]);
    } catch {
      cities = cachedCities;
    }
  }

  return {
    candidates: dedupe([...countries, ...cities]).slice(0, limit),
    warning: null,
  };
}
