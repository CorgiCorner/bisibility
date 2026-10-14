import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import { resolveExpectedUrlForKeyword } from "@/lib/expected-url/keyword";
import { requireTrackedDomain } from "@/lib/projects/tracked-domain";
import type { ProviderCredential } from "@/lib/provider-usage/surface";
import {
  createProviderRequestAttribution,
  type ProviderRequestSource,
  type ProviderRequestTrigger,
} from "@/lib/provider-usage/tag";
import type { SerpProvider } from "@/lib/providers/types";
import {
  resolveEffectiveSerpDepth,
  resolveSerpStopOnMatch,
  type SerpDepth,
} from "@/lib/serp/constants";
import { findComparablePredecessor } from "./comparable-history";
import { runCheckWithFallback } from "./fallback-chain";
import { keywordRankLocation } from "./fallback-location";
import { CURRENT_RANK_NORMALIZATION_VERSION } from "./normalization-version";
import { rankRecoveryContext } from "./recovery-context";
import { fallbackSchedule, persistRankCheck } from "./runner";
import { RankCheckRunnerError } from "./runner-error";

export type { KeywordRankLocation } from "./fallback-location";
export { keywordRankLocation } from "./fallback-location";

import type { DefinitionExecutionPermit } from "@/lib/measurement-definitions/worker-claim";
import { loadSerpProviderChain, ProviderChainError } from "./provider-chain-loader";

export { loadSerpProviderChain, ProviderChainError };

export type RunKeywordCheckWithFallbackInput = {
  definitionPermit?: DefinitionExecutionPermit;
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
  let previous = await findComparablePredecessor(keyword.id, {
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
    definitionPermit: input.definitionPermit,
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
  if (outcome.result.definitionBindingId) {
    previous = outcome.result.comparisonPredecessorId
      ? await prisma.rankCheck.findUnique({ where: { id: outcome.result.comparisonPredecessorId } })
      : null;
  }
  const expectedUrl = outcome.result.definitionBindingId
    ? {
        url: await retainedTargetUrl(
          outcome.result.definitionBindingId,
          keyword.projectId,
          input.rankCheckId,
        ),
      }
    : await resolveExpectedUrlForKeyword(keyword.id);
  outcome.result.recoveryContextHash = rankRecoveryContext(
    {
      text: keyword.text,
      device: keyword.device,
      domain: projectDomain,
      location: keyword.locationRef,
      revision: keyword.updatedAt,
    },
    depth,
  );

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
      keywordTargetUrl: outcome.result.definitionBindingId
        ? expectedUrl.url
        : (keyword.targetUrl ?? null),
      previousRaw: previous?.raw ?? null,
      previousRankingUrl: previous?.rankingUrl ?? null,
      projectId: keyword.projectId,
      providerUsage: outcome.result.providerUsage,
    },
    outcome.result,
  );

  return { attempts: outcome.attempts, keyword, provider: outcome.provider, rankCheck };
}

async function retainedTargetUrl(bindingId: string, projectId: string, rankCheckId?: string) {
  const rows = await prisma.$queryRaw<
    Array<{ targetUrl: string | null }>
  >`SELECT request->>'targetUrl' AS "targetUrl" FROM measurement_execution_bindings WHERE id=${bindingId} AND "projectId"=${projectId} AND "rankCheckId"=${rankCheckId ?? ""}`;
  if (rows.length !== 1) throw new Error("Original winning request is unavailable.");
  return rows[0].targetUrl;
}

export {
  type RunCheckChainInput,
  type RunCheckChainResult,
  runCheckWithFallback,
} from "./fallback-chain";
