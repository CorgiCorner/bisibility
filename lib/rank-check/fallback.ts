import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import { resolveExpectedUrlForKeyword } from "@/lib/expected-url/keyword";
import { requireTrackedDomain } from "@/lib/projects/tracked-domain";
import { type ProviderCredential, surfaceOf } from "@/lib/provider-usage/surface";
import {
  createProviderRequestAttribution,
  type ProviderRequestAttribution,
  type ProviderRequestSource,
  type ProviderRequestTrigger,
} from "@/lib/provider-usage/tag";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { getSerpProvider } from "@/lib/providers/registry";
import type { SerpProvider } from "@/lib/providers/types";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import {
  resolveEffectiveSerpDepth,
  resolveSerpStopOnMatch,
  type SerpDepth,
} from "@/lib/serp/constants";
import { assertRankCheckConnectionAllocation } from "./allocation-enforcement";
import { findComparablePredecessor } from "./comparable-history";
import { fallbackAttempt } from "./fallback-attempt";
import { keywordRankLocation, locationForProvider } from "./fallback-location";
import { assertLegacyLiveBudget } from "./legacy-live-preflight";
import { CURRENT_RANK_NORMALIZATION_VERSION } from "./normalization-version";
import {
  fallbackSchedule,
  PROVIDER_NOT_CONNECTED_MESSAGE,
  persistRankCheck,
  type RankCheckConnectionInput,
  type RankCheckKeywordInput,
  runCheck,
} from "./runner";
import { RankCheckRunnerError } from "./runner-error";
import type { RankCheckScheduleInput } from "./schedule";

export type { KeywordRankLocation } from "./fallback-location";
export { keywordRankLocation } from "./fallback-location";

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
  rankCheckId?: string;
  locationGranular?: boolean;
  resolveProvider?: (id: string) => SerpProvider;
  source?: ProviderRequestSource;
};

export type RunCheckChainResult = {
  result: Awaited<ReturnType<typeof runCheck>>;
  provider: string;
  attempts: FallbackAttempt[];
};

import {
  type FallbackAttempt,
  loadFreshSerpProviderConnection,
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
  let admissionExhaustion:
    | import("@/lib/providers/execution-extension-errors").DeploymentAdmissionExhaustedError
    | undefined;
  let rateLimitedOnly = true;

  for (const connection of input.connections) {
    const currentConnection =
      input.projectId && connection.id
        ? await loadFreshSerpProviderConnection(input.projectId, connection.id, connection.provider)
        : null;
    const liveConnection = input.projectId && connection.id ? currentConnection : connection;
    if (!liveConnection) {
      throw new ProviderUsagePersistenceError({ cause: new Error("Provider connection changed.") });
    }
    let provider: SerpProvider;

    try {
      provider = resolveProvider(connection.provider);
    } catch (error) {
      const fallback = fallbackAttempt(error, connection.provider, input.source);
      if (fallback) {
        attempts.push(fallback.attempt);
        admissionExhaustion = fallback.admission;
        if (!fallback.rateLimited) rateLimitedOnly = false;
        continue;
      }
      throw error;
    }

    try {
      if (input.projectId && liveConnection.credentialSource !== "hosted") {
        await assertLegacyLiveBudget({
          connection: liveConnection,
          depth: input.depth ?? 100,
          keywordId: input.keyword.id,
          now: input.now ?? new Date(),
          projectId: input.projectId,
          rankCheckId: input.rankCheckId,
          reservationConnection: input.connections[0],
          source: input.source ?? "app",
        });
        await assertRankCheckConnectionAllocation(
          {
            connection: liveConnection,
            depth: input.depth ?? 100,
            projectId: input.projectId,
            surface: surfaceOf(input.source),
          },
          prisma,
        );
      }
      const result = await runCheck({
        comparisonAllowed: input.comparisonAllowed,
        connection: liveConnection,
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
        rankCheckId: input.rankCheckId,
        provider,
        schedule: input.schedule,
      });

      return { attempts, provider: provider.id, result };
    } catch (error) {
      const fallback = fallbackAttempt(error, connection.provider, input.source);
      if (fallback) {
        attempts.push(fallback.attempt);
        admissionExhaustion = fallback.admission;
        if (!fallback.rateLimited) rateLimitedOnly = false;
        continue;
      }

      throw error;
    }
  }

  if (rateLimitedOnly) {
    const chainMsg = `All SERP providers rate limited: ${attempts.map((a) => `${a.provider} (${a.message})`).join("; ")}`;
    throw new ProviderRateLimitedError(input.connections[0].provider, { message: chainMsg });
  }

  throw new ProviderChainError(attempts, admissionExhaustion);
}

export type RunKeywordCheckWithFallbackInput = {
  credential?: ProviderCredential;
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
      checkSchedule: { select: { serpDepth: true } },
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
    checkScheduleDepth: keyword.checkSchedule?.serpDepth,
    scheduleDepth: keyword.schedule?.serpDepth,
  });
  const stopOnMatch = resolveSerpStopOnMatch(keyword.project.defaults?.serpStopOnMatch);
  const connections = await loadSerpProviderChain(keyword.projectId, input.providerId);
  const previous = await findComparablePredecessor(keyword.id, {
    normalizationVersion: CURRENT_RANK_NORMALIZATION_VERSION,
    requestedDepth: depth,
  });
  const comparisonAllowed = previous !== null;
  const { handles, granular } = keywordRankLocation(keyword.locationRef);
  const existing =
    input.rankCheckId && "findUnique" in prisma.rankCheck
      ? await prisma.rankCheck.findUnique({
          select: { trigger: true },
          where: { id: input.rankCheckId },
        })
      : null;
  const trigger = input.trigger ?? (existing?.trigger === "scheduled" ? "scheduled" : "manual");
  const providerUsage = await createProviderRequestAttribution(
    {
      correlationId: input.rankCheckId ?? randomUUID(),
      feature: "rank_check",
      projectId: keyword.projectId,
      source: input.source ?? "app",
      trigger,
    },
    input.credential,
  );
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
    rankCheckId: input.rankCheckId,
    resolveProvider: input.resolveProvider,
    schedule: keyword.schedule ?? keyword.project.defaults ?? fallbackSchedule(),
    source: input.source,
  });

  const connection = await prisma.providerConnection.findFirst({
    select: { id: true },
    where: { kind: "serp", projectId: keyword.projectId, provider: outcome.provider },
  });
  const expectedUrl = await resolveExpectedUrlForKeyword(keyword.id);

  const rankCheck = await persistRankCheck(
    {
      connectionId: connection?.id,
      existingRankCheckId: input.rankCheckId,
      attempts: outcome.attempts,
      hasDefaults: Boolean(keyword.project.defaults),
      hasSchedule: Boolean(keyword.schedule),
      keywordId: keyword.id,
      keywordPublicId: keyword.publicId,
      expectedUrlAtCheck: expectedUrl.url,
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
