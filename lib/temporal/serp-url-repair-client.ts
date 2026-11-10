import "server-only";
import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from "@temporalio/client";
import type { UrlRepairTarget } from "../serp-url-repair/model";
import { TEMPORAL_TASK_QUEUE } from "./deployment-config";
import { getSchedulerTemporalClient } from "./scheduler-client";
export type SerpUrlRepairInput = {
  projectId: string;
  actorId: string;
  target: UrlRepairTarget;
  sourceHash: string;
  workflowId: string;
};
export async function startSerpUrlRepair(input: SerpUrlRepairInput) {
  const client = await getSchedulerTemporalClient();
  // Conversion is free and retryable; an explicit later retry may start a new run.
  await client.workflow.start("serpUrlRepairWorkflow", {
    workflowId: input.workflowId,
    workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
    workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
    taskQueue: TEMPORAL_TASK_QUEUE,
    args: [input],
  });
}
export async function serpUrlRepairStatus(workflowId: string) {
  const handle = (await getSchedulerTemporalClient()).workflow.getHandle(workflowId);
  const description = await handle.describe();
  if (description.status.name === "COMPLETED")
    return {
      status: "completed" as const,
      result: (await handle.result()) as { resolved: number; unresolved: number },
    };
  return {
    status: description.status.name === "RUNNING" ? ("running" as const) : ("failed" as const),
  };
}
