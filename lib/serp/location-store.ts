import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Location } from "@/lib/generated/prisma/client";
import type { LocationKind, LocationStore, ResolvedLocation } from "./location";

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
    languageLabel: row.languageLabel,
    primaryGeoCode: row.primaryGeoCode,
    primaryGeoName: row.primaryGeoName,
    regionCode: row.regionCode,
    secondaryGeoName: row.secondaryGeoName,
  };
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
};
