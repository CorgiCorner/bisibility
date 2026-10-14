import "server-only";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { WorkflowIdReusePolicy } from "@temporalio/common";
import { prisma } from "../db/prisma";
import { TEMPORAL_TASK_QUEUE } from "./deployment-config";
import { getSchedulerTemporalClient } from "./scheduler-client";
export async function dispatchLocalMonitorIntents(
  options: { start?: (id: string) => Promise<unknown> } = {},
) {
  const jobs = await prisma.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM local_monitor_launch_intents WHERE state IN ('queued','running') AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt"<=NOW()) ORDER BY "createdAt",id LIMIT 25`;
  const start =
    options.start ??
    (async (id: string) =>
      (await getSchedulerTemporalClient()).workflow.start("localMonitorRunWorkflow", {
        workflowId: `local-monitor:${id}`,
        taskQueue: TEMPORAL_TASK_QUEUE,
        args: [{ id }],
        workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
      }));
  let started = 0;
  for (const job of jobs)
    try {
      await start(job.id);
      started += 1;
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
    }
  return { started };
}
