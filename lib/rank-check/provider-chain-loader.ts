import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import {
  loadProviderRateContexts,
  providerRateContextKey,
} from "@/lib/provider-rates/connection-context";
import { serpProviderChainOrderBy } from "./provider-chain-order";
import type { RankCheckConnectionInput } from "./runner";

export { type FallbackAttempt, ProviderChainError } from "./provider-chain-error";

const inFlightProviderChains = new Map<string, Promise<RankCheckConnectionInput[]>>();

async function loadFromDatabase(
  projectId: string,
  providerId?: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const connections = await client.providerConnection.findMany({
    orderBy: serpProviderChainOrderBy(),
    where: {
      enabled: true,
      kind: "serp",
      projectId,
      status: "connected",
      ...(providerId ? { provider: providerId } : {}),
    },
  });
  const contexts = await loadProviderRateContexts(
    connections.map((connection) => connection.id),
    ["rank_check"],
    new Date(),
    client,
  );
  return connections.map((connection) => ({
    costPerCheckCents:
      connection.credentialSource === "hosted" ? null : connection.costPerCheckCents,
    credentialsEncrypted: connection.credentialsEncrypted,
    credentialSource: connection.credentialSource,
    id: connection.id,
    provider: connection.provider,
    updatedAt: connection.updatedAt,
    rateContext:
      connection.credentialSource === "hosted"
        ? {
            ...(contexts.get(providerRateContextKey(connection.id, "rank_check")) ?? {
              entries: [],
            }),
            manualAmountCents: null,
          }
        : contexts.get(providerRateContextKey(connection.id, "rank_check")),
  }));
}

export function loadSerpProviderChain(
  projectId: string,
  providerId?: string,
  client?: Prisma.TransactionClient,
) {
  if (client) return loadFromDatabase(projectId, providerId, client);
  const cacheKey = JSON.stringify([projectId, providerId ?? null]);
  const existing = inFlightProviderChains.get(cacheKey);
  if (existing) return existing;
  const loading = loadFromDatabase(projectId, providerId);
  inFlightProviderChains.set(cacheKey, loading);
  return loading.finally(() => inFlightProviderChains.delete(cacheKey));
}

/** Read an attempted connection under the same project lock as source changes. */
export function loadFreshSerpProviderConnection(
  projectId: string,
  connectionId: string,
  provider: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockProjectForProviderMutation(tx, projectId);
    const chain = await loadFromDatabase(projectId, provider, tx);
    return chain.find((connection) => connection.id === connectionId) ?? null;
  });
}
