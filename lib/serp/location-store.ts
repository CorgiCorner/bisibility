import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Location } from "@/lib/generated/prisma/client";
import {
  canonicalKey,
  countrySeed,
  type LocationCandidate,
  LocationInputError,
  type LocationKind,
  type LocationStore,
  type ResolvedLocation,
} from "./location";

// Prisma-backed LocationStore (M1 interface). The Location table is global,
// deduped by the unique canonicalKey, and holds the neutral provider handles
// resolved once per location. Vendor names never appear here (CLAUDE.md).

// The Prisma `LocationKind` enum values are identical to the neutral string
// union, so this is a checked pass-through rather than a lookup table.
function toLocationKind(kind: Location["kind"]): LocationKind {
  return kind;
}

// Map a persisted Prisma row down to the neutral ResolvedLocation the resolver
// and adapters speak. Drops timestamps and the relation; keeps only handles.
function toResolvedLocation(row: Location): ResolvedLocation {
  return {
    canonicalKey: row.canonicalKey,
    cityName: row.cityName,
    countryCode: row.countryCode,
    displayName: row.displayName,
    gl: row.gl,
    hl: row.hl,
    id: row.id,
    kind: toLocationKind(row.kind),
    languageCode: row.languageCode,
    languageLabel: row.languageLabel,
    primaryGeoCode: row.primaryGeoCode,
    primaryGeoName: row.primaryGeoName,
    regionCode: row.regionCode,
    secondaryGeoName: row.secondaryGeoName,
  };
}

function isCountryFallback(value: string, countryCode: string) {
  const countryName = countrySeed(countryCode)?.displayName;
  const normalized = normalizedHandleName(value);
  return !normalized || (countryName ? normalized === normalizedHandleName(countryName) : false);
}

function normalizedHandleName(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function handleNamesConflict(persisted: string, candidate: string, countryCode: string) {
  return (
    !isCountryFallback(persisted, countryCode) &&
    !isCountryFallback(candidate, countryCode) &&
    normalizedHandleName(persisted) !== normalizedHandleName(candidate)
  );
}

function assertCompatibleHandles(location: ResolvedLocation, candidate: LocationCandidate) {
  if (
    location.primaryGeoCode !== null &&
    candidate.primaryGeoCode !== null &&
    location.primaryGeoCode !== candidate.primaryGeoCode
  ) {
    throw new LocationInputError(
      "canonicalKey",
      "Cached location conflicts with the selected place.",
    );
  }
  if (
    handleNamesConflict(location.primaryGeoName, candidate.primaryGeoName, location.countryCode) ||
    handleNamesConflict(location.secondaryGeoName, candidate.secondaryGeoName, location.countryCode)
  ) {
    throw new LocationInputError(
      "canonicalKey",
      "Cached location conflicts with the selected place.",
    );
  }
}

function matchesCandidate(location: ResolvedLocation, candidate: LocationCandidate) {
  return (
    location.kind === candidate.kind &&
    location.countryCode.toUpperCase() === candidate.countryCode.toUpperCase() &&
    location.canonicalKey ===
      canonicalKey({
        cityName: candidate.cityName,
        countryCode: candidate.countryCode,
        kind: candidate.kind,
        languageCode: location.languageCode,
        regionCode: candidate.regionCode,
        regionName: candidate.regionName,
      })
  );
}

function handleUpdate(location: ResolvedLocation, candidate: LocationCandidate) {
  if (!matchesCandidate(location, candidate)) return null;
  assertCompatibleHandles(location, candidate);

  const data: {
    primaryGeoCode?: number;
    primaryGeoName?: string;
    secondaryGeoName?: string;
  } = {};
  if (location.primaryGeoCode === null && candidate.primaryGeoCode !== null) {
    data.primaryGeoCode = candidate.primaryGeoCode;
    if (
      isCountryFallback(location.primaryGeoName, location.countryCode) &&
      !isCountryFallback(candidate.primaryGeoName, location.countryCode)
    ) {
      data.primaryGeoName = candidate.primaryGeoName;
    }
  }
  if (
    isCountryFallback(location.secondaryGeoName, location.countryCode) &&
    !isCountryFallback(candidate.secondaryGeoName, location.countryCode)
  ) {
    data.secondaryGeoName = candidate.secondaryGeoName;
  }
  return Object.keys(data).length ? data : null;
}

export const prismaLocationStore: LocationStore = {
  async findByKey(canonicalKey: string): Promise<ResolvedLocation | null> {
    const row = await prisma.location.findUnique({ where: { canonicalKey } });
    return row ? toResolvedLocation(row) : null;
  },

  // Empty-update upserts return the authoritative canonicalKey winner without
  // overwriting handles resolved by another writer.
  async create(row: Omit<ResolvedLocation, "id">): Promise<ResolvedLocation> {
    const persisted = await prisma.location.upsert({
      create: row,
      update: {},
      where: { canonicalKey: row.canonicalKey },
    });
    return toResolvedLocation(persisted);
  },

  async enrich(
    location: ResolvedLocation,
    candidate: LocationCandidate,
  ): Promise<ResolvedLocation> {
    const data = handleUpdate(location, candidate);
    if (!data) return location;

    await prisma.location.updateMany({
      data,
      where: {
        canonicalKey: location.canonicalKey,
        countryCode: location.countryCode,
        id: location.id,
        kind: location.kind,
        primaryGeoCode: location.primaryGeoCode,
        primaryGeoName: location.primaryGeoName,
        secondaryGeoName: location.secondaryGeoName,
      },
    });
    const refreshed = await this.findByKey(location.canonicalKey);
    if (!refreshed) {
      throw new LocationInputError("canonicalKey", "Cached location could not be verified.");
    }
    assertCompatibleHandles(refreshed, candidate);
    return refreshed;
  },
};
