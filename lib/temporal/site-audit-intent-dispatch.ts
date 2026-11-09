import "server-only";

import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { WorkflowIdReusePolicy } from "@temporalio/common";
import { prisma } from "../db/prisma";
import { siteAuditWorkerEnabled } from "../site-audit/worker-config";
import { TEMPORAL_TASK_QUEUE } from "./deployment-config";
import { getSchedulerTemporalClient } from "./scheduler-client";

export async function dispatchSiteAuditIntents() {
  if (!(await siteAuditWorkerEnabled())) return;
  const runs = await prisma.siteAuditRun.findMany({
    where: { state: "queued" },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: 25,
  });
  for (const run of runs) {
    const workflowId = `site-audit:${run.id}:${run.generation}`;
    const stillQueued = await prisma.siteAuditRun.updateMany({
      where: { id: run.id, generation: run.generation, state: "queued" },
      data: { workflowId },
    });
    if (!stillQueued.count) continue;
    try {
      await (await getSchedulerTemporalClient()).workflow.start("siteAuditCrawlWorkflow", {
        workflowId,
        taskQueue: TEMPORAL_TASK_QUEUE,
        args: [{ runId: run.id, generation: run.generation }],
        workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
      });
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
    }
  }
}

export function startSiteAuditIntentProcessor() {
  let active: Promise<void> | null = null;
  const sweep = () => {
    if (active) return;
    active = dispatchSiteAuditIntents()
      .catch(() => console.error("[site-audit] intent dispatch failed"))
      .finally(() => {
        active = null;
      });
  };
  const timer = setInterval(sweep, 2_000);
  timer.unref();
  sweep();
  return {
    async close() {
      clearInterval(timer);
      await active;
    },
  };
}
