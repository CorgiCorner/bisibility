import "server-only";

import {
  positiveTtl,
  readProviderLookupCache,
  withProviderLookupCache,
} from "@/lib/provider-lookups/cache";
import { decryptProviderCredentials } from "@/lib/providers/crypto";
import { getSerpProvider } from "@/lib/providers/registry";
import type { ProviderAvailabilityData } from "@/lib/settings/options";

const DEFAULT_AVAILABILITY_TTL_SECONDS = 15 * 60;
const BALANCE_PROVIDERS = new Set(["dataforseo", "serpapi"]);
const memoryCache = new Map<
  string,
  { expiresAt: number; value: ProviderAvailabilityData | null }
>();

type AvailabilityConnection = {
  credentialSource: "own" | "hosted";
  credentialsEncrypted: string | null;
  id: string;
  kind: string;
  provider: string;
  status: string;
  updatedAt?: Date;
};

function ttlSeconds() {
  return positiveTtl(
    process.env.PROVIDER_AVAILABILITY_TTL_SECONDS,
    DEFAULT_AVAILABILITY_TTL_SECONDS,
  );
}

async function queryAvailability(connection: AvailabilityConnection) {
  if (connection.status === "needs_reauth") {
    return { status: "reconnect_required" } satisfies ProviderAvailabilityData;
  }
  const checkedAt = new Date().toISOString();
  if (!connection.credentialsEncrypted) {
    return { checkedAt, status: "unreachable" } satisfies ProviderAvailabilityData;
  }
  try {
    const result = await getSerpProvider(connection.provider).testConnection(
      decryptProviderCredentials(connection.credentialsEncrypted),
    );
    if (!result.ok) return { checkedAt, status: "unreachable" } satisfies ProviderAvailabilityData;
    if (result.balance == null) return null;
    return {
      amount: result.balance,
      checkedAt,
      status: "available",
      ...(result.availabilityTotal === undefined ? {} : { total: result.availabilityTotal }),
      unit: connection.provider === "serpapi" ? "searches" : "usd",
    } satisfies ProviderAvailabilityData;
  } catch {
    return { checkedAt, status: "unreachable" } satisfies ProviderAvailabilityData;
  }
}

async function cachedAvailability(connection: AvailabilityConnection, fresh = false) {
  const version = connection.updatedAt?.toISOString() ?? "unknown";
  const key = `provider-availability:v1:${connection.id}:${version}`;
  const memory = memoryCache.get(key);
  if (!fresh && memory && memory.expiresAt > Date.now()) return memory.value;
  const ttl = ttlSeconds();
  const result = await withProviderLookupCache({
    key,
    load: () => queryAvailability(connection),
    ttlSeconds: ttl,
    fresh,
  });
  const value = result.status === "success" ? result.value : null;
  memoryCache.set(key, { expiresAt: Date.now() + ttl * 1000, value });
  return value;
}

export async function loadProviderAvailability(
  connections: readonly AvailabilityConnection[],
  refreshConnectionId?: string,
) {
  const entries: Array<readonly [string, ProviderAvailabilityData | null]> = await Promise.all(
    connections.map(async (connection) => {
      if (
        connection.credentialSource !== "own" ||
        connection.kind !== "serp" ||
        !BALANCE_PROVIDERS.has(connection.provider)
      ) {
        return [connection.id, null] as const;
      }
      return [
        connection.id,
        await cachedAvailability(connection, connection.id === refreshConnectionId),
      ] as const;
    }),
  );
  return new Map(entries);
}

/** Cache-only: missing or stale entries never trigger a provider request. */
export async function readCachedProviderAvailability(
  connection: {
    id: string;
    provider: string;
    updatedAt: Date;
    credentialSource: string;
    status: string;
    hasStoredCredentials: boolean;
  },
  now = Date.now(),
) {
  if (
    connection.credentialSource !== "own" ||
    connection.status !== "connected" ||
    !connection.hasStoredCredentials ||
    !BALANCE_PROVIDERS.has(connection.provider)
  )
    return { outcome: "unavailable" as const, reason: "balance_unavailable" as const };
  if (!(connection.updatedAt instanceof Date) || !Number.isFinite(connection.updatedAt.getTime()))
    return { outcome: "unavailable" as const, reason: "balance_mismatch" as const };
  const key = `provider-availability:v1:${connection.id}:${connection.updatedAt.toISOString()}`;
  const memory = memoryCache.get(key);
  const value: unknown =
    memory && memory.expiresAt > now ? memory.value : await readProviderLookupCache<unknown>(key);
  if (!value || typeof value !== "object")
    return { outcome: "unavailable" as const, reason: "balance_unavailable" as const };
  const entry = value as Record<string, unknown>;
  if (
    entry.status !== "available" ||
    typeof entry.amount !== "number" ||
    !Number.isFinite(entry.amount) ||
    entry.amount < 0 ||
    (connection.provider === "serpapi" && !Number.isSafeInteger(entry.amount)) ||
    entry.unit !== (connection.provider === "serpapi" ? "searches" : "usd") ||
    typeof entry.checkedAt !== "string"
  )
    return { outcome: "unavailable" as const, reason: "balance_mismatch" as const };
  const observed = Date.parse(entry.checkedAt);
  const expiresAt = providerAvailabilityExpiry(entry.checkedAt);
  if (!Number.isFinite(observed) || observed > now || !expiresAt || Date.parse(expiresAt) <= now)
    return { outcome: "unavailable" as const, reason: "balance_stale" as const };
  return {
    outcome: "ready" as const,
    value: {
      text: String(entry.amount),
      unit: entry.unit === "usd" ? "USD" : "searches",
      certainty: "measured" as const,
    },
    observedAt: entry.checkedAt,
    expiresAt,
  };
}

export function providerAvailabilityExpiry(checkedAt: string | undefined) {
  const at = Date.parse(checkedAt ?? "");
  const expiry = new Date(at + ttlSeconds() * 1000);
  return Number.isFinite(expiry.getTime()) ? expiry.toISOString() : null;
}
