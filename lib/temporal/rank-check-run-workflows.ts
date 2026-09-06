import { WorkflowIdReusePolicy } from "@temporalio/common";
import {
  continueAsNew,
  ParentClosePolicy,
  proxyActivities,
  sleep,
  startChild,
} from "@temporalio/workflow";
import { RANK_CHECK_RUN_CHILD_CONCURRENCY } from "../rank-check/dispatcher-constants";
import {
  isAlreadyStarted,
  RANK_CHECK_WORKFLOW_TYPE,
  rankCheckWorkflowId,
} from "../rank-check/workflow-id";
import type {
  LoadedRankCheckRunItem,
  LoadRankCheckRunItemsActivityInput,
  LoadRankCheckRunItemsActivityResult,
  RankCheckRunItemCursor,
} from "./rank-check-run-activities";
import { rankCheckSearchAttributes } from "./rank-check-search-attributes";
import type {
  RankCheckWorkflowInput,
  RankCheckWorkflowResult,
} from "./rank-check-workflow-contract";

type RankCheckWorkflow = (input: RankCheckWorkflowInput) => Promise<RankCheckWorkflowResult>;
type RankCheckRunActivities = {
  loadRankCheckRunItemsActivity(
    input: LoadRankCheckRunItemsActivityInput,
  ): Promise<LoadRankCheckRunItemsActivityResult>;
};

const { loadRankCheckRunItemsActivity } = proxyActivities<RankCheckRunActivities>({
  retry: {
    backoffCoefficient: 2,
    initialInterval: "5 seconds",
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
  startToCloseTimeout: "1 minute",
});

export type RankCheckRunWorkflowInput = {
  cursor?: RankCheckRunItemCursor | null;
  runId: string;
  skipped?: number;
  started?: number;
};
export type RankCheckRunWorkflowResult = { skipped: number; started: number };

async function startRunItem(item: LoadedRankCheckRunItem) {
  if (item.notBefore) {
    const delay = new Date(item.notBefore).getTime() - Date.now();
    if (delay > 0) await sleep(delay);
  }
  try {
    await startChild<RankCheckWorkflow>(RANK_CHECK_WORKFLOW_TYPE, {
      args: [
        {
          depth: item.depth,
          keywordId: item.keywordId,
          ...(item.providerId ? { providerId: item.providerId } : {}),
          runItemId: item.id,
        },
      ],
      parentClosePolicy: ParentClosePolicy.ABANDON,
      typedSearchAttributes: rankCheckSearchAttributes({
        keywordId: item.keywordId,
        projectId: item.projectId,
        provider: item.providerId,
        runId: item.runId,
      }),
      workflowId: `${rankCheckWorkflowId(item.keywordId)}-run-${item.id}`,
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
    });
    return "started" as const;
  } catch (error) {
    if (isAlreadyStarted(error)) return "skipped" as const;
    throw error;
  }
}

export async function rankCheckRunWorkflow(
  input: RankCheckRunWorkflowInput,
): Promise<RankCheckRunWorkflowResult> {
  const page = await loadRankCheckRunItemsActivity({
    cursor: input.cursor ?? null,
    limit: 200,
    runId: input.runId,
  });
  let skipped = input.skipped ?? 0;
  let started = input.started ?? 0;
  for (let offset = 0; offset < page.items.length; offset += RANK_CHECK_RUN_CHILD_CONCURRENCY) {
    const starts = await Promise.all(
      page.items.slice(offset, offset + RANK_CHECK_RUN_CHILD_CONCURRENCY).map(startRunItem),
    );
    started += starts.filter((state) => state === "started").length;
    skipped += starts.filter((state) => state === "skipped").length;
  }
  if (page.hasMore && page.nextCursor) {
    return continueAsNew<typeof rankCheckRunWorkflow>({
      cursor: page.nextCursor,
      runId: input.runId,
      skipped,
      started,
    });
  }
  return { skipped, started };
}
