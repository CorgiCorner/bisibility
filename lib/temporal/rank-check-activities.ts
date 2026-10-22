import "server-only";
import { ActionPaymentError } from "@/lib/action-payment/token";
import { ApplicationFailure } from "@temporalio/common";
import { prisma } from "../db/prisma";
import { ProjectReadOnlyError } from "../deployment/project-write-mode";
import { isOperationAccessDeniedError } from "../operations/access-error";
import { ProjectDomainRequiredError } from "../projects/tracked-domain";
import { ProviderCallError } from "../providers/call-error";
import { preflightDeploymentRankExecution } from "../providers/execution-extension";
import { DeploymentAdmissionExhaustedError } from "../providers/execution-extension-errors";
import { ProviderRateLimitedError } from "../providers/rate-limit";
import { ProviderUsagePersistenceError } from "../providers/usage";
import {
  providerUsageFailureDetails,
  safeProviderUsageCause,
} from "../providers/usage-failure-details";
import { isBudgetExhaustedError } from "../rank-check/budget";
import { ProviderChainError, runKeywordCheckWithFallback } from "../rank-check/fallback";
import { RankCheckClosedBeforePersistenceError } from "../rank-check/persistence-errors";
import { resolveRankCheckAttribution } from "../rank-check/run-attribution";
import { activeMarketLocationIds, unrunnableKeywordReason } from "../rank-check/runnable";
import { cancelUnrunnableRankCheckRunItem } from "../rank-check/runs/cancel";
import { SEND_UNCONFIRMED_REASON } from "../rank-check/runs/contract";
import { finalizeRankCheckRun } from "../rank-check/runs/finalize";
import {
  AUTOMATIC_EXECUTION_DISABLED_FAILURE,
  BALANCE_EXHAUSTED_FAILURE,
  BUDGET_EXHAUSTED_FAILURE,
  OPERATION_ACCESS_DENIED_FAILURE,
  PROJECT_DOMAIN_REQUIRED_FAILURE,
  PROJECT_READ_ONLY_FAILURE,
  PROVIDER_RATE_LIMITED_FAILURE,
  RANK_CHECK_CLOSED_FAILURE,
  type RankCheckActivitySuccess,
  type RunRankCheckActivityInput,
} from "./rank-check-activity-contract";
import { authorizeRankCheckExecutionActivity } from "./rank-check-mode-activities";

export * from "./rank-check-activity-contract";
export {
  createRunningRankCheckActivity,
  discardRankCheckActivity,
  failRankCheckActivity,
} from "./rank-check-activity-persistence";
export { authorizeRankCheckExecutionActivity } from "./rank-check-mode-activities";
export const PROVIDER_BILLING_FAILURE = "provider_billing";
export const PROVIDER_AUTH_FAILURE = "provider_auth";

import { claimDefinitionPaidCall } from "@/lib/measurement-definitions/worker-claim";

const PAID_CALL_ALREADY_ATTEMPTED_FAILURE = "rank_check_paid_call_already_attempted";

async function claimPaidCall(rankCheckId: string, inline: boolean) {
  const permit = await prisma.$transaction((tx) =>
    claimDefinitionPaidCall(tx, rankCheckId, inline),
  );
  if (permit) return permit;
  const now = new Date();
  const blocked = await prisma.rankCheckRunItem.updateMany({
    data: {
      actualCostCents: null,
      blockedReason: SEND_UNCONFIRMED_REASON,
      finishedAt: now,
      status: "blocked",
    },
    where: { rankCheckId, status: "running" },
  });
  if (blocked.count === 0) {
    throw ApplicationFailure.create({
      message: "Paid provider execution was already attempted for this rank check.",
      nonRetryable: true,
      type: PAID_CALL_ALREADY_ATTEMPTED_FAILURE,
    });
  }
  const item = await prisma.rankCheckRunItem.findUnique({
    select: {
      run: { select: { id: true, projectId: true, requestedCount: true, status: true } },
    },
    where: { rankCheckId },
  });
  if (item?.run) await finalizeRankCheckRun(prisma, { now, run: item.run });
  throw ApplicationFailure.create({
    message: "Paid provider execution was already attempted for this rank check.",
    nonRetryable: true,
    type: PAID_CALL_ALREADY_ATTEMPTED_FAILURE,
  });
}

/**
 * The runnable predicate, re-read at execution time.
 *
 * Legacy mode gives every keyword its own Temporal Schedule, and the only other protection this
 * branch has there is the reconciler pruning the Schedules of keywords that stopped being
 * runnable - which lands on the reconciler's next sweep, not when the operator pauses the market.
 * A Schedule that fires inside that window arrives here for a keyword whose market is already
 * paused, and everything downstream of this point buys and bills. Dispatcher mode cancels such an
 * item at the claim step, so there this is defence in depth for the same race and it changes no
 * outcome the claim step already produced.
 */
async function unrunnableAutomaticReason(keywordId: string) {
  const keyword = await prisma.keyword.findUnique({
    select: { archivedAt: true, locationId: true, projectId: true },
    where: { id: keywordId },
  });
  // A keyword row this activity cannot read is not this gate's business: the existing chain
  // already reports a missing keyword, and refusing here would rename that failure.
  if (!keyword) return null;
  const activeLocationIds = await activeMarketLocationIds(keyword.projectId, prisma);
  return unrunnableKeywordReason(keyword, activeLocationIds);
}

async function guardPaidCall(input: RunRankCheckActivityInput) {
  if (input.source === "manual" && !input.runItemId) return;
  const unrunnable = await unrunnableAutomaticReason(input.keywordId);
  if (!unrunnable) return;
  if (input.runItemId && input.rankCheckId) {
    await prisma.$transaction((tx) =>
      cancelUnrunnableRankCheckRunItem(tx, {
        rankCheckId: input.rankCheckId as string,
        reason: unrunnable,
      }),
    );
  }
  throw ApplicationFailure.create({
    message: unrunnable,
    nonRetryable: true,
    type: input.runItemId ? RANK_CHECK_CLOSED_FAILURE : AUTOMATIC_EXECUTION_DISABLED_FAILURE,
  });
}

export async function runRankCheckActivity(
  input: RunRankCheckActivityInput,
): Promise<RankCheckActivitySuccess> {
  const authorization = authorizeRankCheckExecutionActivity({
    keywordId: input.keywordId,
    scheduleId: null,
    source: input.source,
  });
  if (!authorization.allowed) {
    throw ApplicationFailure.create({
      message: authorization.reason ?? "Automatic rank-check execution is disabled.",
      nonRetryable: true,
      type: AUTOMATIC_EXECUTION_DISABLED_FAILURE,
    });
  }
  // Inline manual checks remain deliberate operator actions. Queued run items, including manual
  // and API runs, must pass this shared gate before a provider call regardless of their source.
  await guardPaidCall(input);
  if (!input.rankCheckId) throw new Error("Rank check must be prepared before paid I/O.");
  const attribution = await resolveRankCheckAttribution(input, prisma);
  let outcome: Awaited<ReturnType<typeof runKeywordCheckWithFallback>>;
  try {
    await preflightDeploymentRankExecution({ ...input, rankCheckId: input.rankCheckId });
    const definitionPermit = await claimPaidCall(input.rankCheckId, input.inline === true);
    outcome = await runKeywordCheckWithFallback({
      definitionPermit,
      credential: attribution.credential,
      depth: input.depth,
      keywordId: input.keywordId,
      providerId: input.providerId,
      rankCheckId: input.rankCheckId,
      source: attribution.source,
      trigger: attribution.trigger,
    });
  } catch (error) {
    if (error instanceof ActionPaymentError)
      throw ApplicationFailure.create({
        message: "Accepted payment changed. Review a new run before trying again.",
        type: error.reason,
        nonRetryable: true,
      });
    if (error instanceof ProviderCallError && error.code === "provider_capacity_unavailable") {
      await prisma.rankCheck.updateMany({
        where: { id: input.rankCheckId, status: "running" },
        data: { errorCode: error.code },
      });
      throw ApplicationFailure.create({
        message: error.message,
        nonRetryable: true,
        type: error.code,
      });
    }
    if (error instanceof RankCheckClosedBeforePersistenceError) {
      throw ApplicationFailure.create({
        message: error.message,
        nonRetryable: true,
        type: RANK_CHECK_CLOSED_FAILURE,
      });
    }
    if (error instanceof ProviderRateLimitedError) {
      throw ApplicationFailure.create({
        message: error.message,
        nonRetryable: true,
        type: PROVIDER_RATE_LIMITED_FAILURE,
      });
    }
    // A paid-operation denial is a deferral, not a provider fault: the check
    // stays deferred and re-runs when the owner's entitlement returns.
    if (isOperationAccessDeniedError(error)) {
      throw ApplicationFailure.create({
        message: error.message,
        nonRetryable: true,
        type: OPERATION_ACCESS_DENIED_FAILURE,
      });
    }
    if (error instanceof ProjectDomainRequiredError) {
      throw ApplicationFailure.create({
        message: error.message,
        nonRetryable: true,
        type: PROJECT_DOMAIN_REQUIRED_FAILURE,
      });
    }
    if (error instanceof ProjectReadOnlyError) {
      throw ApplicationFailure.create({
        message: error.message,
        nonRetryable: true,
        type: PROJECT_READ_ONLY_FAILURE,
      });
    }
    if (error instanceof ProviderUsagePersistenceError) {
      throw ApplicationFailure.create({
        message: error.message,
        nonRetryable: true,
        type: "provider_usage_unconfirmed",
        details: [providerUsageFailureDetails(error)],
        cause: safeProviderUsageCause(error),
      });
    }
    if (isBudgetExhaustedError(error)) {
      if (input.inline) throw error;
      throw ApplicationFailure.create({
        message: error instanceof Error ? error.message : "Rank check budget exhausted.",
        nonRetryable: true,
        type: BUDGET_EXHAUSTED_FAILURE,
      });
    }
    // biome-ignore format: compact chain handling keeps this activity module under the line cap.
    if (error instanceof ProviderChainError) {
      if (input.rankCheckId) {
        const result = await prisma.rankCheck.updateMany({
          data: { attempts: error.attempts.map(({ message, provider }) => ({ message, provider })), errorCode: error.dominantCode },
          where: { id: input.rankCheckId, status: "running" },
        });
        if (result.count === 0) throw ApplicationFailure.create({ message: "Rank check was closed before its result could be persisted.", nonRetryable: true, type: RANK_CHECK_CLOSED_FAILURE });
      }
      const allocationExhausted =
        error.attempts.length > 0 &&
        error.attempts.every((attempt) => attempt.reason === "allocation_exhausted");
      if (allocationExhausted || error.admissionExhaustion instanceof DeploymentAdmissionExhaustedError) {
        if (input.inline && error.admissionExhaustion instanceof DeploymentAdmissionExhaustedError) throw error;
        throw ApplicationFailure.create({
          message: error.message,
          nonRetryable: true,
          type: error.admissionExhaustion instanceof DeploymentAdmissionExhaustedError && error.admissionExhaustion.reason === "balance"
            ? BALANCE_EXHAUSTED_FAILURE
            : BUDGET_EXHAUSTED_FAILURE,
        });
      }
      const { dominantCode } = error;
      if (dominantCode === "provider_capacity_unavailable" || dominantCode === "provider_billing" || dominantCode === "provider_auth" || dominantCode === "provider_account_restricted") {
        throw ApplicationFailure.create({
          message: error.message, nonRetryable: true,
          type: dominantCode,
        });
      }
      throw error;
    }
    throw error;
  }
  return {
    attempts: outcome.attempts,
    checkedAt: outcome.rankCheck.checkedAt.toISOString(),
    costCents: outcome.rankCheck.costCents == null ? null : Number(outcome.rankCheck.costCents),
    keywordId: outcome.rankCheck.keywordId,
    position: outcome.rankCheck.position,
    provider: outcome.provider,
    rankCheckId: outcome.rankCheck.id,
    rankingUrl: outcome.rankCheck.rankingUrl,
  };
}
