import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { parseSearchEngineIncidents, type SearchEngineIncident } from "./parse";

export const GOOGLE_SEARCH_STATUS_FEED_URL = "https://status.search.google.com/incidents.json";

const ENGINE = "google";

export type SearchEngineUpdateStore = {
  searchEngineUpdate: {
    upsert: (args: {
      create: {
        beginsAt: Date;
        endsAt: Date | null;
        engine: string;
        externalId: string;
        fetchedAt: Date;
        modifiedAt: Date;
        name: string;
        service: string;
        uri: string;
      };
      update: {
        beginsAt: Date;
        endsAt: Date | null;
        fetchedAt: Date;
        modifiedAt: Date;
        name: string;
        service: string;
        uri: string;
      };
      where: { externalId: string };
    }) => Promise<unknown>;
  };
};

export type SyncSearchEngineUpdatesResult =
  | { reason: "http" | "invalid" | "network"; status: "error" }
  | { status: "ok"; upserted: number };

const FEED_TIMEOUT_MS = 10_000;

type SyncOptions = {
  fetch?: typeof fetch;
  now?: Date;
  signal?: AbortSignal;
  store?: SearchEngineUpdateStore;
  url?: string;
};

export async function upsertSearchEngineUpdates(
  incidents: readonly SearchEngineIncident[],
  store: SearchEngineUpdateStore,
  fetchedAt: Date,
) {
  for (const incident of incidents) {
    const data = {
      beginsAt: incident.beginsAt,
      endsAt: incident.endsAt,
      fetchedAt,
      modifiedAt: incident.modifiedAt,
      name: incident.name,
      service: incident.service,
      uri: incident.uri,
    };
    await store.searchEngineUpdate.upsert({
      create: { ...data, engine: ENGINE, externalId: incident.externalId },
      update: data,
      where: { externalId: incident.externalId },
    });
  }
  return incidents.length;
}

/**
 * Fetches the public status feed and upserts it. Network and parse failures
 * return a result; this function does not throw.
 */
export async function syncSearchEngineUpdates(
  options: SyncOptions = {},
): Promise<SyncSearchEngineUpdatesResult> {
  const fetchImpl = options.fetch ?? fetch;
  const store = options.store ?? (prisma as unknown as SearchEngineUpdateStore);
  const now = options.now ?? new Date();
  try {
    const response = await fetchImpl(options.url ?? GOOGLE_SEARCH_STATUS_FEED_URL, {
      signal: options.signal ?? AbortSignal.timeout(FEED_TIMEOUT_MS),
    });
    if (!response.ok) return { reason: "http", status: "error" };
    const payload: unknown = await response.json();
    const incidents = parseSearchEngineIncidents(payload);
    const upserted = await upsertSearchEngineUpdates(incidents, store, now);
    return { status: "ok", upserted };
  } catch (error) {
    return { reason: error instanceof z.ZodError ? "invalid" : "network", status: "error" };
  }
}
