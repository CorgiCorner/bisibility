import type { Prisma } from "@/lib/generated/prisma/client";
import type {
  LocationCandidate,
  LocationDescription,
  LocationStore,
  ResolvedLocation,
} from "@/lib/serp/location";
import {
  type ResolveKeywordLocationInput,
  resolveKeywordLocation,
  resolveKeywordLocationUsingStore,
} from "@/lib/serp/location-service";
import { createPrismaLocationStore, locationCandidateUpdate } from "@/lib/serp/location-store";

type LocationClient = Pick<Prisma.TransactionClient, "location">;

/** Resolve locations without writes and replay any catalog changes after admission. */
export function deferredKeywordLocations(client: LocationClient) {
  const cache = new Map<string, ResolvedLocation>();
  const creates = new Map<string, LocationDescription>();
  const enrichments: Array<{ canonicalKey: string; candidate: LocationCandidate }> = [];
  const readStore = createPrismaLocationStore(client);
  const store: LocationStore = {
    async findByKey(key) {
      if (cache.has(key)) return cache.get(key) ?? null;
      const location = await readStore.findByKey(key);
      if (location) cache.set(key, location);
      return location;
    },
    async create(row) {
      creates.set(row.canonicalKey, row);
      const location = { ...row, id: `pending:${row.canonicalKey}` };
      cache.set(row.canonicalKey, location);
      return location;
    },
    async enrich(location, candidate) {
      const update = locationCandidateUpdate(location, candidate);
      if (!update) return location;
      enrichments.push({ canonicalKey: location.canonicalKey, candidate });
      const updated = { ...location, ...update };
      cache.set(updated.canonicalKey, updated);
      return updated;
    },
  };
  return {
    store,
    async flush(tx: LocationClient) {
      const realStore = createPrismaLocationStore(tx);
      const ids = new Map<string, string>();
      for (const [key, row] of creates) {
        const location = await realStore.create(row);
        ids.set(`pending:${key}`, location.id);
      }
      for (const { canonicalKey, candidate } of enrichments) {
        const location = await realStore.findByKey(canonicalKey);
        if (location && realStore.enrich) await realStore.enrich(location, candidate);
      }
      return ids;
    },
  };
}

export function resolveLocationForReview(
  input: ResolveKeywordLocationInput,
  deferred: ReturnType<typeof deferredKeywordLocations> | null,
) {
  return deferred
    ? resolveKeywordLocationUsingStore(input, deferred.store)
    : resolveKeywordLocation(input);
}
