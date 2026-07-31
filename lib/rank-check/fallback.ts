import { prisma } from "@/lib/db/prisma";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import {
  loadProviderRateContexts,
  providerRateContextKey,
} from "@/lib/provider-rates/connection-context";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { getSerpProvider } from "@/lib/providers/registry";
import type { SerpProvider } from "@/lib/providers/types";
import {
  resolveEffectiveSerpDepth,
  resolveSerpStopOnMatch,
  type SerpDepth,
} from "@/lib/serp/markets";
import { assertBudgetAvailable } from "./budget";
import { findComparablePredecessor } from "./comparable-history";
import { estimatedRankCheckCostCents } from "./default-cost";
import { keywordRankLocation, locationForProvider } from "./fallback-location";
import { CURRENT_RANK_NORMALIZATION_VERSION } from "./normalization-version";
import { serpProviderChainOrderBy } from "./provider-chain-order";
import {
  fallbackSchedule,
  PROVIDER_NOT_CONNECTED_MESSAGE,
  persistRankCheck,
  type RankCheckConnectionInput,
  type RankCheckKeywordInput,
  RankCheckRunnerError,
  type RankCheckRunnerErrorCode,
  runCheck,
} from "./runner";
import type { RankCheckScheduleInput } from "./schedule";

export type { KeywordRankLocation } from "./fallback-location";
export { keywordRankLocation } from "./fallback-location";

const FALLBACK_CODES: ReadonlySet<RankCheckRunnerErrorCode> = new Set([
  "provider_failed",
  "provider_rate_limited",
  "credentials_unavailable",
]);

export type FallbackAttempt = {
  provider: string;
  message: string;
};

export type RunCheckChainInput = {
  comparisonAllowed?: boolean;
  keyword: RankCheckKeywordInput;
  schedule: RankCheckScheduleInput;
  depth?: SerpDepth;
  stopOnMatch?: boolean;
  /** Connections ordered by priority ascending (primary first). */
  connections: RankCheckConnectionInput[];
  previousPosition?: number | null;
  completedCheckCount?: number;
  now?: Date;
  /** Owning project id; threaded through as the provider rate-limit fallback key. */
  projectId?: string;
  /**
   * Enables provider-specific city degradation; false is already country-safe.
   */
  locationGranular?: boolean;
  /** Override for tests; defaults to the real provider registry. */
  resolveProvider?: (id: string) => SerpProvider;
};

export type RunCheckChainResult = {
  result: Awaited<ReturnType<typeof runCheck>>;
  /** Id of the provider that produced the result. */
  provider: string;
  /** Providers that failed before the successful one (empty on first-try success). */
  attempts: FallbackAttempt[];
};

export class ProviderChainError extends RankCheckRunnerError {
  constructor(readonly attempts: FallbackAttempt[]) {
    super(
      "provider_failed",
      `All SERP providers failed: ${attempts
        .map((attempt) => `${attempt.provider} (${attempt.message})`)
        .join("; ")}`,
    );
    this.name = "ProviderChainError";
  }
}

const inFlightProviderChains = new Map<string, Promise<RankCheckConnectionInput[]>>();

async function loadSerpProviderChainFromDatabase(
  projectId: string,
  providerId?: string,
): Promise<RankCheckConnectionInput[]> {
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
    provider: connection.provider,
    rateContext: contexts.get(providerRateContextKey(connection.id, "rank_check")),
  }));
}

export function loadSerpProviderChain(
  projectId: string,
  providerId?: string,
): Promise<RankCheckConnectionInput[]> {
  const cacheKey = JSON.stringify([projectId, providerId ?? null]);
  const existing = inFlightProviderChains.get(cacheKey);
  if (existing) return existing;

  const loading = loadSerpProviderChainFromDatabase(projectId, providerId);
  inFlightProviderChains.set(cacheKey, loading);
  return loading.finally(() => {
    inFlightProviderChains.delete(cacheKey);
  });
}

export async function runCheckWithFallback(
  input: RunCheckChainInput,
): Promise<RunCheckChainResult> {
  if (input.connections.length === 0) {
    throw new RankCheckRunnerError("no_provider_connected", PROVIDER_NOT_CONNECTED_MESSAGE);
  }

  const resolveProvider = input.resolveProvider ?? getSerpProvider;
  const attempts: FallbackAttempt[] = [];
  let rateLimitedOnly = true;

  for (const connection of input.connections) {
    let provider: SerpProvider;

    try {
      provider = resolveProvider(connection.provider);
    } catch (error) {
      if (error instanceof RankCheckRunnerError && FALLBACK_CODES.has(error.code)) {
        attempts.push({ message: error.message, provider: connection.provider });
        if (error.code !== "provider_rate_limited") {
          rateLimitedOnly = false;
        }
        continue;
      }
      throw error;
    }

    try {
      const result = await runCheck({
        comparisonAllowed: input.comparisonAllowed,
        connection,
        depth: input.depth,
        stopOnMatch: input.stopOnMatch,
        keyword: {
          ...input.keyword,
          location: locationForProvider(
            provider.id,
            input.keyword.location,
            input.locationGranular ?? false,
          ),
        },
        now: input.now,
        previousPosition: input.previousPosition,
        completedCheckCount: input.completedCheckCount,
        projectId: input.projectId,
        provider,
        schedule: input.schedule,
      });

      return { attempts, provider: provider.id, result };
    } catch (error) {
      if (error instanceof RankCheckRunnerError && FALLBACK_CODES.has(error.code)) {
        attempts.push({ message: error.message, provider: connection.provider });
        if (error.code !== "provider_rate_limited") {
          rateLimitedOnly = false;
        }
        continue;
      }

      throw error;
    }
  }

  // Every provider in the chain was rate-limited: defer (not fail) so the keyword
  // stays due and the next scheduled fire retries, preserving quota.
  if (rateLimitedOnly) {
    throw new ProviderRateLimitedError(input.connections[0].provider, {
      message: `All SERP providers rate limited: ${attempts
        .map((attempt) => `${attempt.provider} (${attempt.message})`)
        .join("; ")}`,
    });
  }

  throw new ProviderChainError(attempts);
}

export type RunKeywordCheckWithFallbackInput = {
  depth?: SerpDepth;
  keywordId: string;
  rankCheckId?: string;
  providerId?: string;
  now?: Date;
  /** Override for tests; defaults to the real provider registry. */
  resolveProvider?: (id: string) => SerpProvider;
};

/**
 * Temporal retries and manual checks share this provider-fallback persistence path.
 */
export async function runKeywordCheckWithFallback(input: RunKeywordCheckWithFallbackInput) {
  const keyword = await prisma.keyword.findUnique({
    include: {
      // Join the resolved Location so the runner has gl/hl/geo handles without a
      // per-check query; null relation falls back to the legacy string (design §5).
      locationRef: true,
      project: { include: { defaults: true } },
      _count: { select: { rankChecks: { where: { status: "completed" } } } },
      schedule: true,
    },
    where: { id: input.keywordId },
  });
  if (!keyword) {
    throw new RankCheckRunnerError("keyword_not_found", "Keyword not found.");
  }
  assertProjectWritable(keyword.project);
  const depth = resolveEffectiveSerpDepth({
    projectDepth: keyword.project.defaults?.serpDepth,
    requestedDepth: input.depth,
    scheduleDepth: keyword.schedule?.serpDepth,
  });
  const stopOnMatch = resolveSerpStopOnMatch(keyword.project.defaults?.serpStopOnMatch);
  const connections = await loadSerpProviderChain(keyword.projectId, input.providerId);
  await assertBudgetAvailable(keyword.projectId, input.now ?? new Date(), {
    // The keyword query above already loaded the project row; skip the cap re-read.
    capCents: keyword.project.budgetCapCents,
    estimatedCostCents: estimatedRankCheckCostCents(
      connections[0]?.provider,
      depth,
      connections[0]?.costPerCheckCents,
      connections[0]?.rateContext ?? LIST_PROVIDER_RATE_CONTEXT,
    ),
    excludeRankCheckId: input.rankCheckId,
  });

  const previous = await findComparablePredecessor(keyword.id, {
    normalizationVersion: CURRENT_RANK_NORMALIZATION_VERSION,
    requestedDepth: depth,
  });
  const comparisonAllowed = previous !== null;
  const { handles, granular } = keywordRankLocation(keyword.locationRef, keyword.location);
  const outcome = await runCheckWithFallback({
    comparisonAllowed,
    connections,
    depth,
    stopOnMatch,
    keyword: {
      device: keyword.device,
      domain: keyword.project.domain,
      id: keyword.id,
      location: handles,
      text: keyword.text,
    },
    locationGranular: granular,
    now: input.now,
    previousPosition: previous?.position ?? null,
    completedCheckCount: keyword._count?.rankChecks ?? 0,
    projectId: keyword.projectId,
    resolveProvider: input.resolveProvider,
    schedule: keyword.schedule ?? keyword.project.defaults ?? fallbackSchedule(),
  });

  const connection = await prisma.providerConnection.findFirst({
    select: { id: true },
    where: { kind: "serp", projectId: keyword.projectId, provider: outcome.provider },
  });

  const rankCheck = await persistRankCheck(
    {
      connectionId: connection?.id,
      existingRankCheckId: input.rankCheckId,
      attempts: outcome.attempts,
      hasDefaults: Boolean(keyword.project.defaults),
      hasSchedule: Boolean(keyword.schedule),
      keywordId: keyword.id,
      keywordPublicId: keyword.publicId,
      keywordTargetUrl: keyword.targetUrl ?? null,
      previousRaw: previous?.raw ?? null,
      previousRankingUrl: previous?.rankingUrl ?? null,
      projectId: keyword.projectId,
    },
    outcome.result,
  );

  return { attempts: outcome.attempts, keyword, provider: outcome.provider, rankCheck };
}
