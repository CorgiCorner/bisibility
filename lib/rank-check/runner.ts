import "server-only";

import type { Prisma } from "@/lib/generated/prisma/client";
import {
  LIST_PROVIDER_RATE_CONTEXT,
  type ResolveProviderRateInput,
} from "@/lib/provider-rates/resolver";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import { consumeProviderLimit, writeCooldown } from "@/lib/providers/rate-limit";
import { getSerpProvider } from "@/lib/providers/registry";
import type {
  ProviderCredentials,
  SerpDevice,
  SerpProvider,
  SerpRankResult,
} from "@/lib/providers/types";
import type { SerpRankLocation } from "@/lib/serp/location";
import { DEFAULT_SERP_DEPTH, resolveSerpStopOnMatch, type SerpDepth } from "@/lib/serp/markets";
import { rankCheckCostCents } from "./cost";
import { estimatedRankCheckCostCents } from "./default-cost";
import { organicDomainRanksFromResults } from "./organic-ranks";
import type { RankCheckRunResult } from "./runner-result";

export { RankCheckClosedBeforePersistenceError } from "./persistence-errors";
export type {
  PersistRankCheckDependencies,
  RankCheckFailureTarget,
  RankCheckPersistTarget,
} from "./runner-persistence";
export {
  persistFailedRankCheck,
  persistRankCheck,
} from "./runner-persistence";

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
  provider: string;
  costPerCheckCents?: unknown;
  credentials?: ProviderCredentials;
  credentialsEncrypted?: string | null;
  rateContext?: Pick<ResolveProviderRateInput, "entries" | "manualAmountCents">;
};

export type RunCheckInput = {
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
};

// Classify provider errors carrying HTTP 429 signals as cooldown deferrals, not
// generic provider failures.
function isProviderThrottleError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return /\b429\b|too many requests|rate.?limit/.test(message);
}

export type RankCheckRunnerErrorCode =
  | "keyword_not_found"
  | "no_provider_connected"
  | "credentials_unavailable"
  | "provider_rate_limited"
  | "provider_failed";

export class RankCheckRunnerError extends Error {
  constructor(
    readonly code: RankCheckRunnerErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "RankCheckRunnerError";
  }
}

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

export async function runCheck(input: RunCheckInput): Promise<RankCheckRunResult> {
  const provider = input.provider ?? getSerpProvider(input.connection.provider);
  const requestedDepth = input.depth ?? DEFAULT_SERP_DEPTH;
  let credentials: ProviderCredentials;

  try {
    credentials = credentialsFromConnection(input.connection);
  } catch (error) {
    throw new RankCheckRunnerError(
      "credentials_unavailable",
      "Provider credentials could not be decrypted.",
      { cause: error },
    );
  }

  const gate = await consumeProviderLimit(provider.id, credentials, {
    projectId: input.projectId,
  });
  if (!gate.success) {
    throw new RankCheckRunnerError(
      "provider_rate_limited",
      `Provider ${provider.id} rate limit reached; deferring this check.`,
    );
  }

  let rank: SerpRankResult;

  try {
    rank = await provider.fetchRank({
      keyword: input.keyword.text,
      completedCheckCount: input.completedCheckCount,
      location: input.keyword.location,
      device: input.keyword.device,
      domain: input.keyword.domain,
      depth: requestedDepth,
      stopOnMatch: resolveSerpStopOnMatch(input.stopOnMatch),
      credentials,
    });
  } catch (error) {
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
  }

  const checkedAt = input.now ?? rank.checkedAt;
  const costCents = rankCheckCostCents(rank.costCents, input.connection.costPerCheckCents);
  const reportedCostCents = Number(rank.costCents);

  return {
    providerCostCents:
      Number.isFinite(reportedCostCents) && reportedCostCents > 0 ? reportedCostCents : undefined,
    rankCheck: {
      billingUnits: rank.billingUnits ?? null,
      keywordId: input.keyword.id,
      organicRanks: rank.raw ? organicDomainRanksFromResults(rank.raw.organic_results) : null,
      position: rank.position,
      previousPosition: input.previousPosition ?? null,
      rankingUrl: rank.rankingUrl,
      requestedDepth,
      checkedAt,
      provider: provider.id,
      costCents,
      estimatedCostCents:
        costCents > 0
          ? null
          : estimatedRankCheckCostCents(
              provider.id,
              requestedDepth,
              input.connection.costPerCheckCents,
              input.connection.rateContext ?? LIST_PROVIDER_RATE_CONTEXT,
            ),
      raw: rankCheckRaw(rank),
    },
    scheduleUpdate: {
      lastCheckedAt: checkedAt,
      nextCheckAt: computeNextCheckAt(input.schedule, checkedAt, input.keyword.id),
    },
  };
}
