import { prisma } from "@/lib/db/prisma";
import {
  loadProviderRateContexts,
  providerRateContextKey,
} from "@/lib/provider-rates/connection-context";
import { dominantErrorCode, type ProviderErrorCode } from "@/lib/providers/provider-error-code";
import { serpProviderChainOrderBy } from "./provider-chain-order";
import type { RankCheckConnectionInput } from "./runner";
import { RankCheckRunnerError } from "./runner-error";

export type FallbackAttempt = {
  provider: string;
  message: string;
  code?: ProviderErrorCode;
  reason?: "allocation_exhausted";
};

export class ProviderChainError extends RankCheckRunnerError {
  readonly dominantCode: ProviderErrorCode;
  constructor(readonly attempts: FallbackAttempt[]) {
    super(
      "provider_failed",
      `All SERP providers failed: ${attempts.map((attempt) => `${attempt.provider} (${attempt.message})`).join("; ")}`,
    );
    this.name = "ProviderChainError";
    this.dominantCode = dominantErrorCode(
      attempts.map((attempt) => attempt.code ?? "provider_transient"),
    );
  }
}

const inFlightProviderChains = new Map<string, Promise<RankCheckConnectionInput[]>>();

async function loadFromDatabase(projectId: string, providerId?: string) {
  const connections = await prisma.providerConnection.findMany({
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
  );
  return connections.map((connection) => ({
    costPerCheckCents: connection.costPerCheckCents,
    credentialsEncrypted: connection.credentialsEncrypted,
    id: connection.id,
    provider: connection.provider,
    rateContext: contexts.get(providerRateContextKey(connection.id, "rank_check")),
  }));
}

export function loadSerpProviderChain(projectId: string, providerId?: string) {
  const cacheKey = JSON.stringify([projectId, providerId ?? null]);
  const existing = inFlightProviderChains.get(cacheKey);
  if (existing) return existing;
  const loading = loadFromDatabase(projectId, providerId);
  inFlightProviderChains.set(cacheKey, loading);
  return loading.finally(() => inFlightProviderChains.delete(cacheKey));
}
