import "server-only";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { planDueTrackingSchedules } from "../ai-tracking/scheduling/sweep";
import { prisma } from "../db/prisma";
import type { AiTrackingWorkflowInput } from "./ai-tracking-contract";
import { TEMPORAL_TASK_QUEUE } from "./deployment-config";
import { getSchedulerTemporalClient } from "./scheduler-client";

export async function dispatchAiTrackingIntents(
  options: {
    start?: (input: AiTrackingWorkflowInput, workflowId: string) => Promise<unknown>;
  } = {},
) {
  await planDueTrackingSchedules();
  const runs = await prisma.aiTrackingRun.findMany({
    where: {
      state: { in: ["planned", "running", "cancelled"] },
      samples: {
        some: {
          OR: [
            {
              dispatch: {
                in: ["planned", "claimed", "submitted", "collecting", "submission_started"],
              },
            },
            { dispatch: "submission_unknown", providerTaskId: { not: null } },
          ],
        },
      },
    },
    take: 100,
    orderBy: { createdAt: "asc" },
  });
  let started = 0;
  const start =
    options.start ??
    (async (input, workflowId) =>
      (await getSchedulerTemporalClient()).workflow.start("aiTrackingRunWorkflow", {
        workflowId,
        taskQueue: TEMPORAL_TASK_QUEUE,
        args: [input],
      }));
  for (const run of runs) {
    try {
      await start({ projectId: run.projectId, runId: run.id }, `ai-tracking:${run.id}`);
      started += 1;
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
    }
  }
  return { started };
}
