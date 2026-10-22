import {
  BudgetExhaustedError,
  ProviderAllocationExhaustedError,
} from "@/lib/metering/admission-errors";
import type { RunCheckInput } from "./runner-input";
import { credentialsFromConnection, isProviderThrottleError, rankCheckRaw } from "./runner-support";
import "server-only";
import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import { prisma } from "@/lib/db/prisma";
import { assertOperationAccess } from "@/lib/operations/access-extension";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { createProviderRequestJournal } from "@/lib/provider-usage/request-journal";
import { providerAllocationMetadata } from "@/lib/providers/allocation-metadata";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { assertOwnKeyStored } from "@/lib/providers/own-key-guard";
import { consumeProviderLimit, writeCooldown } from "@/lib/providers/rate-limit";
import { getSerpProvider } from "@/lib/providers/registry";
import type { ProviderCredentials, SerpRankResult } from "@/lib/providers/types";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { DEFAULT_SERP_DEPTH, resolveSerpStopOnMatch } from "@/lib/serp/constants";
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

import { loadDefinitionComparablePrevious } from "@/lib/measurement-definitions/worker-comparable";
import { configuredWorkerObservation } from "@/lib/measurement-definitions/worker-session";
import { prepareRunnerDefinition } from "./runner-definition";
import { computeNextCheckAt } from "./schedule";

export type { RankCheckRunnerErrorCode } from "./runner-error";
export { RankCheckRunnerError } from "./runner-error";

export function runCheck(input: RunCheckInput): Promise<RankCheckRunResult> {
  return runCheckScoped(input);
}
async function runCheckScoped(original: RunCheckInput): Promise<RankCheckRunResult> {
  const selectedProvider = original.provider ?? getSerpProvider(original.connection.provider);
  const { input, definition } = await prepareRunnerDefinition(original, selectedProvider.id);
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
  if (!execution && !input.connection.credentials && input.projectId) {
    await assertOwnKeyStored({
      capability: "rank_check",
      credentialsEncrypted: input.connection.credentialsEncrypted,
      projectId: input.projectId,
      provider: provider.id,
    });
  }

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
          logicalOperationKey: input.payment?.operationKey,
          costLimit: input.payment?.costLimit,
          beforeFence: input.definitionFence,
          beforeReserve: input.definitionBeforeReserve,
          connectionId: input.connection.id,
          projectId: input.projectId,
          provider: provider.id,
          keywordId: input.keyword.id,
          unit: allocation.allocationUnit,
          credentialVersion: ownCredentialVersion(
            provider.id,
            input.connection.id,
            input.connection.credentialsEncrypted,
          ),
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
  } catch (caughtError) {
    let error = caughtError;
    if (
      error instanceof DeploymentAdmissionExhaustedError ||
      error instanceof BudgetExhaustedError ||
      error instanceof ProviderAllocationExhaustedError
    )
      throw error;
    if (error instanceof ProviderUsagePersistenceError) throw error;
    error = execution?.classifyFailure ? await execution.classifyFailure(error) : error;
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
    try {
      await execution?.finish();
    } finally {
      if (input.payment)
        await input.payment.record(
          execution
            ? { operationKey: input.payment.operationKey }
            : { attemptIds: journal?.attemptIds ?? [] },
        );
    }
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

  const definitionPrevious = definition
    ? await loadDefinitionComparablePrevious(
        definition.binding,
        rank.observation?.surface === "web_serp" ? rank.observation : null,
        rank.position,
        checkedAt,
      )
    : null;
  return {
    comparisonPredecessorId: definition ? (definitionPrevious?.id ?? null) : undefined,
    definitionBindingId: definition?.binding.id ?? null,
    usageRecorded: execution?.started ?? journal?.started ?? false,
    comparisonAllowed: definition
      ? definitionPrevious !== null
      : (input.comparisonAllowed ?? false),
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
      previousPosition: definition
        ? (definitionPrevious?.position ?? null)
        : (input.previousPosition ?? null),
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
      observation: configuredWorkerObservation(rank.observation, definition),
      raw: rankCheckRaw(rank, input.connection.id),
    },
    scheduleUpdate: {
      lastCheckedAt: checkedAt,
      nextCheckAt: computeNextCheckAt(input.schedule, checkedAt, input.keyword.id),
    },
  };
}

export type {
  RankCheckConnectionInput,
  RankCheckKeywordInput,
  RunCheckInput,
} from "./runner-input";
export { fallbackSchedule, PROVIDER_NOT_CONNECTED_MESSAGE } from "./runner-support";
