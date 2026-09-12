import "server-only";

import { positiveTtl, withProviderLookupCache } from "@/lib/provider-lookups/cache";
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

async function cachedAvailability(connection: AvailabilityConnection) {
  const version = connection.updatedAt?.toISOString() ?? "unknown";
  const key = `provider-availability:v1:${connection.id}:${version}`;
  const memory = memoryCache.get(key);
  if (memory && memory.expiresAt > Date.now()) return memory.value;
  const ttl = ttlSeconds();
  const result = await withProviderLookupCache({
    key,
    load: () => queryAvailability(connection),
    ttlSeconds: ttl,
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
      if (connection.kind !== "serp" || !BALANCE_PROVIDERS.has(connection.provider)) {
        return [connection.id, null] as const;
      }
      return [
        connection.id,
        await (connection.id === refreshConnectionId
          ? queryAvailability(connection)
          : cachedAvailability(connection)),
      ] as const;
    }),
  );
  return new Map(entries);
}
