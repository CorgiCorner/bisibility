import "server-only";
import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { withShadowRequest } from "@/lib/metering/shadow-context";
import { assertOperationAccess } from "@/lib/operations/access-extension";
import {
  LIST_PROVIDER_RATE_CONTEXT,
  type ResolveProviderRateInput,
} from "@/lib/provider-rates/resolver";
import { createProviderRequestJournal } from "@/lib/provider-usage/request-journal";
import type { ProviderRequestAttribution } from "@/lib/provider-usage/tag";
import { providerAllocationMetadata } from "@/lib/providers/allocation-metadata";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import { consumeProviderLimit, writeCooldown } from "@/lib/providers/rate-limit";
import { getSerpProvider } from "@/lib/providers/registry";
import type {
  ProviderCredentials,
  SerpDevice,
  SerpProvider,
  SerpRankResult,
} from "@/lib/providers/types";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { DEFAULT_SERP_DEPTH, resolveSerpStopOnMatch, type SerpDepth } from "@/lib/serp/constants";
import type { SerpRankLocation } from "@/lib/serp/location";
import { rankCheckCostCents } from "./cost";
import { estimatedRankCheckCostCents } from "./default-cost";
import { CURRENT_RANK_NORMALIZATION_VERSION } from "./normalization-version";
import { organicDomainRanksFromV2Results } from "./organic-ranks";
import { RankCheckRunnerError } from "./runner-error";
import { assertLiveSourceAtDispatch, prepareLiveRankExecution } from "./runner-hosted";
import type { RankCheckRunResult } from "./runner-result";

export { RankCheckClosedBeforePersistenceError } from "./persistence-errors";
export type {
  PersistRankCheckDependencies,
  RankCheckFailureTarget,
  RankCheckPersistTarget,
} from "./runner-persistence";
export { persistFailedRankCheck, persistRankCheck } from "./runner-persistence";

import { computeNextCheckAt, type RankCheckScheduleInput } from "./schedule";

export const PROVIDER_NOT_CONNECTED_MESSAGE = "Connect a SERP provider before running rank checks.";

export type RankCheckKeywordInput = {
  id: string;
  text: string;
  location: SerpRankLocation;
  device: SerpDevice;
  domain: string;
};

export type RankCheckConnectionInput = {
  id?: string;
  provider: string;
  costPerCheckCents?: unknown;
  credentials?: ProviderCredentials;
  credentialsEncrypted?: string | null;
  credentialSource?: string;
  updatedAt?: Date;
  rateContext?: Pick<ResolveProviderRateInput, "entries" | "manualAmountCents">;
};

export type RunCheckInput = {
  comparisonAllowed?: boolean;
  keyword: RankCheckKeywordInput;
  schedule: RankCheckScheduleInput;
  connection: RankCheckConnectionInput;
  depth?: SerpDepth;
  stopOnMatch?: boolean;
  provider?: SerpProvider;
  previousPosition?: number | null;
  completedCheckCount?: number;
  now?: Date;
  /** Owning project id; only used as the provider rate-limit fallback key. */
  projectId?: string;
  providerUsage?: ProviderRequestAttribution;
  rankCheckId?: string;
};

// Classify provider errors carrying HTTP 429 signals as cooldown deferrals, not
// generic provider failures.
function isProviderThrottleError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return /\b429\b|too many requests|rate.?limit/.test(message);
}

export type { RankCheckRunnerErrorCode } from "./runner-error";
export { RankCheckRunnerError } from "./runner-error";

export function fallbackSchedule(): RankCheckScheduleInput {
  return {
    cronExpression: null,
    frequency: "manual",
    jitterMinutes: 0,
    timezone: "UTC",
  };
}

function credentialsFromConnection(connection: RankCheckConnectionInput) {
  if (connection.credentials) {
    return connection.credentials;
  }

  return resolveProviderCredentials(connection.provider, connection.credentialsEncrypted);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function rankCheckRaw(rank: SerpRankResult) {
  if (!isRecord(rank.raw)) return null;
  const json = structuredClone(rank.raw) as unknown;
  return isRecord(json) ? (json as Prisma.InputJsonObject) : null;
}

export function runCheck(input: RunCheckInput): Promise<RankCheckRunResult> {
  return withShadowRequest(() => runCheckScoped(input));
}
async function runCheckScoped(input: RunCheckInput): Promise<RankCheckRunResult> {
  // Final guard for every caller, including the legacy scheduled path: a
  // denial must escape before credentials, the rate limit, or any provider
  // fetch. A trusted owning project is required; without one there is no
  // owner to resolve and the caller proceeds as before.
  if (input.projectId) {
    await assertOperationAccess(input.projectId);
  }
  const provider = input.provider ?? getSerpProvider(input.connection.provider);
  const requestedDepth = input.depth ?? DEFAULT_SERP_DEPTH;
  const { execution, hosted, providerUsage } = await prepareLiveRankExecution(
    input,
    provider.id,
    requestedDepth,
  );
  let credentials: ProviderCredentials;

  try {
    credentials = execution?.credentials ?? credentialsFromConnection(input.connection);
  } catch (error) {
    await execution?.finish();
    throw new RankCheckRunnerError(
      "credentials_unavailable",
      "Provider credentials could not be decrypted.",
      { cause: error },
    );
  }

  const gate = await consumeProviderLimit(provider.id, credentials, {
    projectId: input.projectId,
  }).catch(async (error: unknown) => {
    await execution?.finish();
    throw error;
  });
  if (!gate.success) {
    await execution?.finish();
    throw new RankCheckRunnerError(
      "provider_rate_limited",
      `Provider ${provider.id} rate limit reached; deferring this check.`,
    );
  }

  try {
    await assertLiveSourceAtDispatch(input);
  } catch (error) {
    await execution?.finish();
    throw error;
  }

  let rank: SerpRankResult;
  const allocation = providerAllocationMetadata(provider.id);
  const journal =
    !hosted &&
    input.connection.id &&
    input.projectId &&
    providerUsage &&
    allocation?.kind === "billable"
      ? createProviderRequestJournal(prisma, {
          attribution: providerUsage,
          connectionId: input.connection.id,
          projectId: input.projectId,
          provider: provider.id,
          keywordId: input.keyword.id,
          unit: allocation.allocationUnit,
          estimate: {
            cents: (
              estimatedRankCheckCostCents(
                provider.id,
                requestedDepth,
                input.connection.costPerCheckCents,
                input.connection.rateContext ?? LIST_PROVIDER_RATE_CONTEXT,
              ) ?? 0
            ).toFixed(4),
            units: String(pagesPerCheck(requestedDepth)),
          },
        })
      : null;

  try {
    rank = await provider.fetchRank({
      keyword: input.keyword.text,
      completedCheckCount: input.completedCheckCount,
      location: input.keyword.location,
      device: input.keyword.device,
      domain: input.keyword.domain,
      depth: requestedDepth,
      stopOnMatch: resolveSerpStopOnMatch(input.stopOnMatch),
      attribution: providerUsage,
      tag: providerUsage?.tag,
      credentials: journal ? { ...credentials, usageObserver: journal.observer } : credentials,
    });
  } catch (error) {
    if (error instanceof ProviderUsagePersistenceError) throw error;
    if (execution && (!execution.started || execution.costCents === null)) {
      throw new ProviderUsagePersistenceError({ cause: error });
    }
    if (isProviderThrottleError(error)) {
      writeCooldown(gate.accountKey);
      throw new RankCheckRunnerError(
        "provider_rate_limited",
        error instanceof Error ? error.message : "Provider rate limited the request.",
        { cause: error },
      );
    }
    throw new RankCheckRunnerError(
      "provider_failed",
      error instanceof Error ? error.message : "Rank check provider request failed.",
      { cause: error },
    );
  } finally {
    await execution?.finish();
  }

  const checkedAt = input.now ?? rank.checkedAt;
  const costCents = execution?.started
    ? execution.costCents
    : journal?.started
      ? journal.costCents
      : rankCheckCostCents(rank.costCents);
  if (hosted && (!execution?.started || costCents === null))
    throw new ProviderUsagePersistenceError();
  const reportedCostCents = execution?.costCents ?? Number(rank.costCents);

  return {
    usageRecorded: execution?.started ?? journal?.started ?? false,
    comparisonAllowed: input.comparisonAllowed ?? false,
    providerCostCents:
      Number.isFinite(reportedCostCents) && reportedCostCents > 0 ? reportedCostCents : undefined,
    providerUsage,
    rankCheck: {
      billingUnits: execution?.started
        ? execution.quantity
        : journal?.started
          ? journal.quantity
          : (rank.billingUnits ?? null),
      keywordId: input.keyword.id,
      organicRanks: rank.raw ? organicDomainRanksFromV2Results(rank.raw.organic_results) : null,
      position: rank.position,
      previousPosition: input.previousPosition ?? null,
      rankingUrl: rank.rankingUrl,
      requestedDepth,
      checkedAt,
      provider: provider.id,
      costCents,
      estimatedCostCents:
        (allocation?.kind === "billable" && allocation.allocationUnit === "units") ||
        costCents !== null
          ? null
          : estimatedRankCheckCostCents(
              provider.id,
              requestedDepth,
              input.connection.costPerCheckCents,
              input.connection.rateContext ?? LIST_PROVIDER_RATE_CONTEXT,
            ),
      normalizationVersion: CURRENT_RANK_NORMALIZATION_VERSION,
      observation: rank.observation ?? null,
      raw: rankCheckRaw(rank),
    },
    scheduleUpdate: {
      lastCheckedAt: checkedAt,
      nextCheckAt: computeNextCheckAt(input.schedule, checkedAt, input.keyword.id),
    },
  };
}
