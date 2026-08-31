// Pure, deterministic workflow code. Provider calls, Prisma writes and quota accounting
// all live in the activities; the workflow only decides how long to wait and when to
// hand the remaining days to a fresh execution.
import {
  ApplicationFailure,
  continueAsNew,
  patched,
  proxyActivities,
  sleep,
} from "@temporalio/workflow";
import type {
  SearchInsightsIncrementalActivityInput,
  SearchInsightsIncrementalActivityResult,
  SearchInsightsIncrementalForAllActivityResult,
} from "./search-insights-activities";
import {
  SEARCH_INSIGHTS_NEEDS_REAUTH_FAILURE,
  SEARCH_INSIGHTS_RATE_LIMITED_FAILURE,
  type SearchInsightsBackfillActivityInput,
  type SearchInsightsBackfillBatchResult,
  type SearchInsightsBackfillWorkflowInput,
  type SearchInsightsBackfillWorkflowResult,
  type SearchInsightsImportRef,
  type SearchInsightsSyncWorkflowInput,
} from "./search-insights-contract";

type SearchInsightsActivities = {
  deliverSearchInsightsMilestoneActivity(input: {
    importId: string;
    milestone: "first_data" | "first_28" | "full";
  }): Promise<{ delivered: number }>;
  markSearchInsightsImportFailedActivity(input: SearchInsightsImportRef): Promise<void>;
  runSearchInsightsBackfillBatchActivity(
    input: SearchInsightsBackfillActivityInput,
  ): Promise<SearchInsightsBackfillBatchResult>;
  runSearchInsightsIncrementalActivity(
    input: SearchInsightsIncrementalActivityInput,
  ): Promise<SearchInsightsIncrementalActivityResult>;
  runSearchInsightsIncrementalForAllActivity(): Promise<SearchInsightsIncrementalForAllActivityResult>;
};

// History stays small and a redeploy picks up the remaining days quickly.
const BATCHES_PER_RUN = 20;
const FIRST_BACKOFF_MINUTES = 2;
const MAX_BACKOFF_MINUTES = 30;

const {
  deliverSearchInsightsMilestoneActivity,
  markSearchInsightsImportFailedActivity,
  runSearchInsightsBackfillBatchActivity,
  runSearchInsightsIncrementalActivity,
  runSearchInsightsIncrementalForAllActivity,
} = proxyActivities<SearchInsightsActivities>({
  heartbeatTimeout: "2 minutes",
  retry: {
    backoffCoefficient: 2,
    initialInterval: "10 seconds",
    maximumAttempts: 3,
    maximumInterval: "1 minute",
  },
  startToCloseTimeout: "30 minutes",
});

// An activity failure reaches the workflow wrapped in an ActivityFailure whose `cause`
// is the original ApplicationFailure; unwrap one level to classify it.
function failureType(error: unknown): string | null {
  const candidates = [error, (error as { cause?: unknown })?.cause];
  const failure = candidates.find(
    (candidate): candidate is ApplicationFailure => candidate instanceof ApplicationFailure,
  );
  return failure?.type ?? null;
}

function nextBackoffMinutes(previous: number) {
  const next = previous > 0 ? previous * 2 : FIRST_BACKOFF_MINUTES;
  return Math.min(next, MAX_BACKOFF_MINUTES);
}

export async function searchInsightsBackfillWorkflow(
  input: SearchInsightsBackfillWorkflowInput,
): Promise<SearchInsightsBackfillWorkflowResult> {
  let batches = input.batches ?? 0;
  let days = input.days ?? 0;
  let pausedMinutes = input.pausedMinutes ?? 0;
  const importRef = {
    projectId: input.projectId,
    property: input.property,
    ...(input.source === undefined ? {} : { source: input.source }),
  };

  while (true) {
    batches += 1;
    let batch: SearchInsightsBackfillBatchResult | null = null;
    try {
      batch = await runSearchInsightsBackfillBatchActivity({
        ...importRef,
        ...(input.batchSize === undefined ? {} : { batchSize: input.batchSize }),
        ...(input.retentionMonths === undefined ? {} : { retentionMonths: input.retentionMonths }),
      });
      pausedMinutes = 0;
    } catch (error) {
      const type = failureType(error);
      if (type === SEARCH_INSIGHTS_NEEDS_REAUTH_FAILURE) return { days, status: "paused" };
      if (type !== SEARCH_INSIGHTS_RATE_LIMITED_FAILURE) {
        await markSearchInsightsImportFailedActivity(importRef);
        return { days, status: "failed" };
      }
      // Quota, not an error: wait longer each time, then pick the cursor back up.
      pausedMinutes = nextBackoffMinutes(pausedMinutes);
      await sleep(`${pausedMinutes} minutes`);
    }

    if (batch) {
      if (batch.waitingForFirstData) return { days, status: "waiting_for_first_data" };
      days += batch.daysProcessed;
      // Nothing to import yet, or nothing readable: stop without claiming the window is done.
      if (batch.blocked) return { days, status: "paused" };
      if (batch.importId) {
        if (patched("search-import-first-data-milestone-v1")) {
          await deliverSearchInsightsMilestoneActivity({
            importId: batch.importId,
            milestone: "first_data",
          });
        }
        await deliverSearchInsightsMilestoneActivity({
          importId: batch.importId,
          milestone: "first_28",
        });
      }
      if (batch.done) {
        if (batch.importId) {
          await deliverSearchInsightsMilestoneActivity({
            importId: batch.importId,
            milestone: "full",
          });
        }
        return { days, status: "completed" };
      }
      if (input.requestSetsPerHour && batch.requestSets > 0) {
        const targetMs = (batch.requestSets * 60 * 60 * 1000) / input.requestSetsPerHour;
        const remainingMs = Math.max(0, Math.round(targetMs - batch.batchElapsedMs));
        if (remainingMs > 0) await sleep(remainingMs);
      }
    }

    if (batches % BATCHES_PER_RUN === 0) {
      return continueAsNew<typeof searchInsightsBackfillWorkflow>({
        ...input,
        batches,
        days,
        pausedMinutes,
      });
    }
  }
}

export async function searchInsightsSyncWorkflow(
  input?: SearchInsightsSyncWorkflowInput,
): Promise<
  SearchInsightsIncrementalActivityResult | SearchInsightsIncrementalForAllActivityResult
> {
  if (input?.projectId) return runSearchInsightsIncrementalActivity({ projectId: input.projectId });
  return runSearchInsightsIncrementalForAllActivity();
}
