import "server-only";

import { WorkflowNotFoundError } from "@temporalio/common";
import type { RankCheckRunWorkflowGateway } from "../rank-check/runs/reconcile";
import { startRankCheckRunWorkflow } from "./client";
import { getSchedulerTemporalClient } from "./scheduler-client";

// One gateway serves both queued-run consumers: the maintenance sweep and the intent processor.
// The row claim in queued-launch.ts decides the winner; this only turns a won claim into a start.
export const rankCheckRunWorkflowGateway: RankCheckRunWorkflowGateway = {
  startRun: ({ runId, workflowId }) => {
    console.info("[rank-check-runs] starting queued workflow", { runId, workflowId });
    return startRankCheckRunWorkflow({ runId }, { workflowId });
  },
  workflowExists: async (workflowId) => {
    try {
      await (await getSchedulerTemporalClient()).workflow.getHandle(workflowId).describe();
      return true;
    } catch (error) {
      if (
        error instanceof WorkflowNotFoundError ||
        (error as { name?: string })?.name === "WorkflowNotFoundError"
      ) {
        return false;
      }
      throw error;
    }
  },
};
