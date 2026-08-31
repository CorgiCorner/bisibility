import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { searchSyncRequestSetsPerHour } from "@/lib/search-insights/sync/plan";
import { resolveSearchSyncSettings } from "@/lib/settings/search-sync-config";
import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowIdConflictPolicy,
  WorkflowIdReusePolicy,
} from "@temporalio/common";
import { TEMPORAL_TASK_QUEUE } from "./client";
import { getSchedulerTemporalClient } from "./scheduler-client";
import { SEARCH_INSIGHTS_SYNC_WORKFLOW_TYPE } from "./search-insights-bootstrap";

export const SEARCH_INSIGHTS_BACKFILL_WORKFLOW_TYPE = "searchInsightsBackfillWorkflow";

// The property is hashed so one deterministic id per property stays short and no
// customer domain ends up in a Temporal workflow id. Source is absent because its property keys cannot collide.
export function searchInsightsBackfillWorkflowId(projectId: string, property: string) {
  const digest = createHash("sha256").update(property).digest("hex").slice(0, 16);
  return `search-insights-backfill:${projectId}:${digest}`;
}

export function searchInsightsSyncWorkflowId(projectId: string) {
  return `search-insights-sync:${projectId}`;
}

/**
 * Start the connect-time backfill for one property. The deterministic id deduplicates a
 * running execution, never a closed one: a backfill that stopped because the provider had
 * finalized no day yet, or because the authorization was lost, has to be startable again
 * when the property is reconnected.
 */
export async function startSearchInsightsBackfillWorkflow(input: {
  projectId: string;
  property: string;
  source?: "ga4" | "gsc";
}): Promise<{ workflowId: string }> {
  const client = await getSchedulerTemporalClient();
  const settings =
    input.source === "ga4"
      ? null
      : resolveSearchSyncSettings(
          await prisma.projectDefaults.findUnique({ where: { projectId: input.projectId } }),
        );
  const workflowId = searchInsightsBackfillWorkflowId(input.projectId, input.property);
  try {
    await client.workflow.start(SEARCH_INSIGHTS_BACKFILL_WORKFLOW_TYPE, {
      args: [
        {
          projectId: input.projectId,
          property: input.property,
          ...(settings
            ? {
                requestSetsPerHour: searchSyncRequestSetsPerHour(settings.pace),
                retentionMonths: settings.retentionMonths,
              }
            : {}),
          ...(input.source === undefined ? {} : { source: input.source }),
        },
      ],
      taskQueue: TEMPORAL_TASK_QUEUE,
      workflowId,
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
    });
    return { workflowId };
  } catch (error) {
    // A start that raced another one is the same import, not a failure.
    if (error instanceof WorkflowExecutionAlreadyStartedError) return { workflowId };
    throw error;
  }
}

/** Start one project's incremental sync, or join the execution already running. */
export async function startSearchInsightsSyncWorkflow(input: { projectId: string }) {
  const client = await getSchedulerTemporalClient();
  const handle = await client.workflow.start(SEARCH_INSIGHTS_SYNC_WORKFLOW_TYPE, {
    args: [{ projectId: input.projectId }],
    taskQueue: TEMPORAL_TASK_QUEUE,
    workflowId: searchInsightsSyncWorkflowId(input.projectId),
    workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
    workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
  });
  return { runId: handle.firstExecutionRunId, workflowId: handle.workflowId };
}
