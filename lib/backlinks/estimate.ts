import { backlinksCacheTtlSeconds } from "./cache";
import type { BacklinksEstimate } from "./types";

export function backlinksEstimateEnvelope(input: {
  cachedSnapshot: { expiresAt: Date; fetchedAt: Date } | null;
  estimatedCostCents: number;
  includeSubdomains: boolean;
  provider: string;
  scope: "page" | "site";
  target: string;
}): BacklinksEstimate {
  return {
    cached: input.cachedSnapshot !== null,
    cachedUntil: input.cachedSnapshot
      ? new Date(
          Math.min(
            input.cachedSnapshot.expiresAt.getTime(),
            input.cachedSnapshot.fetchedAt.getTime() + backlinksCacheTtlSeconds() * 1000,
          ),
        ).toISOString()
      : null,
    costCents: input.cachedSnapshot ? 0 : input.estimatedCostCents,
    estimate: true,
    estimatedCostCents: input.estimatedCostCents,
    includeSubdomains: input.includeSubdomains,
    ok: true,
    provider: input.provider,
    target: input.target,
    targetScope: input.scope,
  };
}
