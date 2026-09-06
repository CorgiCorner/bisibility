import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import { requireTrackedDomain } from "@/lib/projects/tracked-domain";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { ProviderAllocationExhaustedError } from "@/lib/provider-usage/enforcement";
import {
  createProviderRequestAttribution,
  type ProviderRequestAttribution,
  type ProviderRequestSource,
  type ProviderRequestTrigger,
} from "@/lib/provider-usage/tag";
import { providerErrorCodeFromError } from "@/lib/providers/call-error";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { getSerpProvider } from "@/lib/providers/registry";
import type { SerpProvider } from "@/lib/providers/types";
import {
  resolveEffectiveSerpDepth,
  resolveSerpStopOnMatch,
  type SerpDepth,
} from "@/lib/serp/markets";
import { assertRankCheckConnectionAllocation } from "./allocation-enforcement";
import { assertBudgetAvailable } from "./budget";
import { findComparablePredecessor } from "./comparable-history";
import { estimatedRankCheckCostCents } from "./default-cost";
import { keywordRankLocation, locationForProvider } from "./fallback-location";
import { CURRENT_RANK_NORMALIZATION_VERSION } from "./normalization-version";
import {
  fallbackSchedule,
  PROVIDER_NOT_CONNECTED_MESSAGE,
  persistRankCheck,
  type RankCheckConnectionInput,
  type RankCheckKeywordInput,
  runCheck,
} from "./runner";
import { RankCheckRunnerError, type RankCheckRunnerErrorCode } from "./runner-error";
import type { RankCheckScheduleInput } from "./schedule";

export type { KeywordRankLocation } from "./fallback-location";
export { keywordRankLocation } from "./fallback-location";

const FALLBACK_CODES: ReadonlySet<RankCheckRunnerErrorCode> = new Set([
  "provider_failed",
  "provider_rate_limited",
  "credentials_unavailable",
]);

export type RunCheckChainInput = {
  comparisonAllowed?: boolean;
  keyword: RankCheckKeywordInput;
  schedule: RankCheckScheduleInput;
  depth?: SerpDepth;
  stopOnMatch?: boolean;
  connections: RankCheckConnectionInput[];
  previousPosition?: number | null;
  completedCheckCount?: number;
  now?: Date;
  projectId?: string;
  providerUsage?: ProviderRequestAttribution;
  locationGranular?: boolean;
  resolveProvider?: (id: string) => SerpProvider;
};

export type RunCheckChainResult = {
  result: Awaited<ReturnType<typeof runCheck>>;
  provider: string;
  attempts: FallbackAttempt[];
};

import {
  type FallbackAttempt,
  loadSerpProviderChain,
  ProviderChainError,
} from "./provider-chain-loader";

export { loadSerpProviderChain, ProviderChainError };

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
        attempts.push({
          message: error.message,
          provider: connection.provider,
          code:
            error.code === "provider_rate_limited"
              ? "provider_rate_limited"
              : providerErrorCodeFromError(error.cause),
        });
        if (error.code !== "provider_rate_limited") rateLimitedOnly = false;
        continue;
      }
      throw error;
    }

    try {
      if (input.projectId) {
        await assertRankCheckConnectionAllocation(
          { connection, depth: input.depth ?? 100, projectId: input.projectId },
          prisma,
        );
      }
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
        providerUsage: input.providerUsage,
        provider,
        schedule: input.schedule,
      });

      return { attempts, provider: provider.id, result };
    } catch (error) {
      // Allocation exhaustion is a connection-local policy outcome, so it participates in
      // provider fallback without being reported as provider rate limiting.
      if (error instanceof ProviderAllocationExhaustedError) {
        attempts.push({
          message: error.message,
          provider: connection.provider,
          reason: "allocation_exhausted",
        });
        rateLimitedOnly = false;
        continue;
      }
      if (error instanceof RankCheckRunnerError && FALLBACK_CODES.has(error.code)) {
        attempts.push({
          message: error.message,
          provider: connection.provider,
          code:
            error.code === "provider_rate_limited"
              ? "provider_rate_limited"
              : providerErrorCodeFromError(error.cause),
        });
        if (error.code !== "provider_rate_limited") rateLimitedOnly = false;
        continue;
      }

      throw error;
    }
  }

  if (rateLimitedOnly) {
    const chainMsg = `All SERP providers rate limited: ${attempts.map((a) => `${a.provider} (${a.message})`).join("; ")}`;
    throw new ProviderRateLimitedError(input.connections[0].provider, { message: chainMsg });
  }

  throw new ProviderChainError(attempts);
}

export type RunKeywordCheckWithFallbackInput = {
  depth?: SerpDepth;
  keywordId: string;
  rankCheckId?: string;
  providerId?: string;
  now?: Date;
  resolveProvider?: (id: string) => SerpProvider;
  source?: ProviderRequestSource;
  trigger?: ProviderRequestTrigger;
};

export async function runKeywordCheckWithFallback(input: RunKeywordCheckWithFallbackInput) {
  const keyword = await prisma.keyword.findUnique({
    include: {
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
  const projectDomain = requireTrackedDomain(keyword.project);
  const depth = resolveEffectiveSerpDepth({
    projectDepth: keyword.project.defaults?.serpDepth,
    requestedDepth: input.depth,
    scheduleDepth: keyword.schedule?.serpDepth,
  });
  const stopOnMatch = resolveSerpStopOnMatch(keyword.project.defaults?.serpStopOnMatch);
  const connections = await loadSerpProviderChain(keyword.projectId, input.providerId);
  if (!keyword.project.providerAllocationsInitializedAt) {
    await assertBudgetAvailable(keyword.projectId, input.now ?? new Date(), {
      capCents: keyword.project.budgetCapCents,
      estimatedCostCents: estimatedRankCheckCostCents(
        connections[0]?.provider,
        depth,
        connections[0]?.costPerCheckCents,
        connections[0]?.rateContext ?? LIST_PROVIDER_RATE_CONTEXT,
      ),
      excludeRankCheckId: input.rankCheckId,
    });
  }

  const previous = await findComparablePredecessor(keyword.id, {
    normalizationVersion: CURRENT_RANK_NORMALIZATION_VERSION,
    requestedDepth: depth,
  });
  const comparisonAllowed = previous !== null;
  const { handles, granular } = keywordRankLocation(keyword.locationRef, keyword.location);
  const existing =
    input.rankCheckId && "findUnique" in prisma.rankCheck
      ? await prisma.rankCheck.findUnique({
          select: { trigger: true },
          where: { id: input.rankCheckId },
        })
      : null;
  const trigger = input.trigger ?? (existing?.trigger === "scheduled" ? "scheduled" : "manual");
  const providerUsage = await createProviderRequestAttribution({
    correlationId: input.rankCheckId ?? randomUUID(),
    feature: "rank_check",
    projectId: keyword.projectId,
    source: input.source ?? "app",
    trigger,
  });
  const outcome = await runCheckWithFallback({
    comparisonAllowed,
    connections,
    depth,
    stopOnMatch,
    keyword: {
      device: keyword.device,
      domain: projectDomain,
      id: keyword.id,
      location: handles,
      text: keyword.text,
    },
    locationGranular: granular,
    now: input.now,
    previousPosition: previous?.position ?? null,
    completedCheckCount: keyword._count?.rankChecks ?? 0,
    projectId: keyword.projectId,
    providerUsage,
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
      providerUsage: outcome.result.providerUsage,
    },
    outcome.result,
  );

  return { attempts: outcome.attempts, keyword, provider: outcome.provider, rankCheck };
}
