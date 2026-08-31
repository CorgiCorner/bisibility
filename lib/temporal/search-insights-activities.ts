import "server-only";

import { ApplicationFailure } from "@temporalio/common";
import { ProviderAuthError } from "../providers/auth-error";
import { ProviderRateLimitedError } from "../providers/rate-limit";
import { runBackfillBatch } from "../search-insights/sync/backfill";
import { markImportFailed } from "../search-insights/sync/import-state";
import {
  type IncrementalForAllResult,
  type IncrementalResult,
  runIncrementalForAllProjects,
  runIncrementalSync,
} from "../search-insights/sync/incremental";
import {
  deliverSearchImportMilestone,
  type SearchImportMilestone,
} from "../search-insights/sync/milestone-notifications";
import { runOrganicSessionsBackfillBatch } from "../search-insights/sync/sessions-backfill";
import { heartbeatingActivity } from "./heartbeating-activity";
import {
  SEARCH_INSIGHTS_NEEDS_REAUTH_FAILURE,
  SEARCH_INSIGHTS_RATE_LIMITED_FAILURE,
  type SearchInsightsBackfillActivityInput,
  type SearchInsightsBackfillBatchResult,
  type SearchInsightsImportRef,
} from "./search-insights-contract";

// A day partition can hold the activity open for minutes, so it heartbeats well inside
// the heartbeat timeout the workflow sets.
const HEARTBEAT_MS = 20_000;

export type SearchInsightsIncrementalActivityInput = {
  projectId: string;
  property?: string;
};

export type SearchInsightsIncrementalActivityResult = IncrementalResult;
export type SearchInsightsIncrementalForAllActivityResult = IncrementalForAllResult;

// Quota and authorization are expected outcomes, not bugs: they become named failures
// the workflow can wait on or stop for, never a retry storm against the provider.
function providerApplicationFailure(error: unknown): never {
  if (error instanceof ProviderRateLimitedError) {
    throw ApplicationFailure.create({
      message: error.message,
      nonRetryable: true,
      type: SEARCH_INSIGHTS_RATE_LIMITED_FAILURE,
    });
  }
  if (error instanceof ProviderAuthError) {
    throw ApplicationFailure.create({
      message: error.message,
      nonRetryable: true,
      type: SEARCH_INSIGHTS_NEEDS_REAUTH_FAILURE,
    });
  }
  throw error;
}

export async function runSearchInsightsBackfillBatchActivity(
  input: SearchInsightsBackfillActivityInput,
): Promise<SearchInsightsBackfillBatchResult> {
  try {
    return await heartbeatingActivity(
      {
        details: { phase: "backfill", projectId: input.projectId },
        heartbeatMs: HEARTBEAT_MS,
      },
      (signal) =>
        input.source === "ga4"
          ? runOrganicSessionsBackfillBatch(input, signal ? { signal } : {}).then((result) => ({
              ...result,
              batchElapsedMs: 0,
              importId: null,
              requestSets: 0,
            }))
          : runBackfillBatch(input, signal ? { signal } : {}),
    );
  } catch (error) {
    providerApplicationFailure(error);
  }
}

export async function runSearchInsightsIncrementalActivity(
  input: SearchInsightsIncrementalActivityInput,
): Promise<SearchInsightsIncrementalActivityResult> {
  try {
    return await heartbeatingActivity(
      {
        details: { phase: "incremental", projectId: input.projectId },
        heartbeatMs: HEARTBEAT_MS,
      },
      () => runIncrementalSync(input),
    );
  } catch (error) {
    providerApplicationFailure(error);
  }
}

export async function runSearchInsightsIncrementalForAllActivity(): Promise<SearchInsightsIncrementalForAllActivityResult> {
  return heartbeatingActivity(
    { details: { phase: "incremental-all" }, heartbeatMs: HEARTBEAT_MS },
    () => runIncrementalForAllProjects(new Date()),
  );
}

export async function markSearchInsightsImportFailedActivity(
  input: SearchInsightsImportRef,
): Promise<void> {
  if (input.source) {
    await markImportFailed(input.projectId, input.property, input.source);
    return;
  }
  await markImportFailed(input.projectId, input.property);
}

export async function deliverSearchInsightsMilestoneActivity(input: {
  importId: string;
  milestone: SearchImportMilestone;
}) {
  return deliverSearchImportMilestone(input);
}
