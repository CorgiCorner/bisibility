import { WorkflowExecutionAlreadyStartedError, WorkflowIdReusePolicy } from "@temporalio/common";
import {
  continueAsNew,
  log,
  ParentClosePolicy,
  proxyActivities,
  startChild,
} from "@temporalio/workflow";
import type { DispatchBackfillResult } from "../rank-check/dispatcher-state";
import type {
  ClaimDueRankChecksResult,
  ClaimedRankCheckGroup,
  RankCheckClaimCompensation,
} from "../rank-check/dispatcher-types";
import { chunkQueuedRankCheckGroup } from "../rank-check/queued-batches";
import { startQueuedBatchChild, startRankCheckChild } from "./rank-check-dispatcher-starts";

type DispatcherActivities = {
  backfillKeywordDispatchStatesActivity(input: {
    cursor: string | null;
    pageSize: number;
  }): Promise<DispatchBackfillResult>;
  claimDueRankChecksActivity(): Promise<ClaimDueRankChecksResult>;
  compensateFailedRankCheckClaimsActivity(input: {
    claims: RankCheckClaimCompensation[];
  }): Promise<{ requested: number; restored: number; stale: number }>;
  planQueuedRankCheckGroupActivity(
    group: ClaimDueRankChecksResult["groups"][number],
  ): Promise<
    | { mode: "deferred"; reason: string }
    | { mode: "legacy"; reason: string }
    | { mode: "queued"; provider: "dataforseo" }
  >;
};

const {
  backfillKeywordDispatchStatesActivity,
  claimDueRankChecksActivity,
  compensateFailedRankCheckClaimsActivity,
  planQueuedRankCheckGroupActivity,
} = proxyActivities<DispatcherActivities>({
  retry: {
    backoffCoefficient: 2,
    initialInterval: "5 seconds",
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
  startToCloseTimeout: "1 minute",
});

const BOOTSTRAP_WORKFLOW_ID = "bootstrap-rank-check-dispatcher";
const BOOTSTRAP_WORKFLOW_TYPE = "bootstrapRankCheckDispatcherWorkflow";
const BACKFILL_PAGE_SIZE = 200;
const PAGES_PER_RUN = 50;

function isAlreadyRunning(error: unknown) {
  return (
    error instanceof WorkflowExecutionAlreadyStartedError ||
    (error as { name?: string })?.name === "WorkflowExecutionAlreadyStartedError"
  );
}

export type DispatcherBootstrapInput = {
  cursor?: string | null;
  pages?: number;
  seeded?: number;
};

export async function bootstrapRankCheckDispatcherWorkflow(
  input: DispatcherBootstrapInput = {},
): Promise<{ pages: number; seeded: number }> {
  let cursor = input.cursor ?? null;
  let pages = input.pages ?? 0;
  let seeded = input.seeded ?? 0;

  for (let page = 0; page < PAGES_PER_RUN; page += 1) {
    const result = await backfillKeywordDispatchStatesActivity({
      cursor,
      pageSize: BACKFILL_PAGE_SIZE,
    });
    cursor = result.cursor;
    pages += 1;
    seeded += result.seeded;
    if (result.done) return { pages, seeded };
  }

  return continueAsNew<typeof bootstrapRankCheckDispatcherWorkflow>({ cursor, pages, seeded });
}

async function ensureBootstrapStarted() {
  try {
    await startChild(BOOTSTRAP_WORKFLOW_TYPE, {
      args: [],
      parentClosePolicy: ParentClosePolicy.ABANDON,
      workflowId: BOOTSTRAP_WORKFLOW_ID,
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
    });
  } catch (error) {
    if (!isAlreadyRunning(error)) throw error;
  }
}

export type DispatchDueRankChecksResult = ClaimDueRankChecksResult & {
  compensationRestored: number;
  compensationStale: number;
  queuedBatches: number;
  queuedKeywords: number;
  skippedRunning: number;
  started: number;
  workflowStartFailures: number;
};

function claimsForKeywords(group: ClaimedRankCheckGroup, keywordIds: string[]) {
  const selected = new Set(keywordIds);
  const claims = group.claims.filter((claim) => selected.has(claim.keywordId));
  if (claims.length !== keywordIds.length) {
    throw new Error("Claim result is missing compensation data.");
  }
  return claims;
}

export async function dispatchDueRankChecksWorkflow(): Promise<DispatchDueRankChecksResult> {
  await ensureBootstrapStarted();
  const claimed = await claimDueRankChecksActivity();
  let queuedBatches = 0;
  let queuedKeywords = 0;
  let skippedRunning = 0;
  let started = 0;
  let workflowStartFailures = 0;
  const failedClaims: RankCheckClaimCompensation[] = [];
  for (const group of claimed.groups) {
    const route = await planQueuedRankCheckGroupActivity(group);
    if (route.mode === "queued" || route.mode === "deferred") {
      const chunks = chunkQueuedRankCheckGroup({
        claimedAt: claimed.claimedAt,
        device: group.device,
        keywordIds: group.keywordIds,
        locationId: group.locationId,
        projectId: group.projectId,
      });
      for (const chunk of chunks) {
        const outcome = await startQueuedBatchChild({
          ...chunk,
          ...(route.mode === "deferred" ? { preflightDeferredReason: route.reason } : {}),
        });
        if (outcome.status === "started") {
          queuedBatches += 1;
          queuedKeywords += outcome.count;
        } else if (outcome.status === "already_started") {
          skippedRunning += outcome.count;
        } else {
          workflowStartFailures += 1;
          failedClaims.push(...claimsForKeywords(group, chunk.keywordIds));
        }
      }
      continue;
    }
    const starts = await Promise.all(
      group.keywordIds.map((keywordId) =>
        startRankCheckChild(keywordId, group.projectId, claimed.claimedAt),
      ),
    );
    for (let index = 0; index < starts.length; index += 1) {
      const outcome = starts[index];
      if (outcome?.status === "started") started += 1;
      else if (outcome?.status === "already_started") skippedRunning += 1;
      else if (outcome?.status === "failed") {
        workflowStartFailures += 1;
        failedClaims.push(...claimsForKeywords(group, [group.keywordIds[index] ?? ""]));
      }
    }
  }

  const compensation =
    failedClaims.length > 0
      ? await compensateFailedRankCheckClaimsActivity({ claims: failedClaims })
      : { requested: 0, restored: 0, stale: 0 };
  const result = {
    ...claimed,
    compensationRestored: compensation.restored,
    compensationStale: compensation.stale,
    queuedBatches,
    queuedKeywords,
    skippedRunning,
    started,
    workflowStartFailures,
  };
  log.info("Rank-check dispatcher pass completed", {
    claimedRows: claimed.claimed,
    compensationRestored: result.compensationRestored,
    compensationStale: result.compensationStale,
    distinctProjects: claimed.metrics.distinctProjects,
    largestPerProjectClaim: claimed.metrics.largestProjectClaim,
    oldestDueLagAfterMs: claimed.metrics.oldestDueLagMsAfter,
    oldestDueLagBeforeMs: claimed.metrics.oldestDueLagMsBefore,
    outcome: claimed.metrics.outcome,
    workflowStartFailures,
  });
  return result;
}
