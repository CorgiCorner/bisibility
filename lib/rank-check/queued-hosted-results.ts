import "server-only";

import { prisma } from "@/lib/db/prisma";
import { recoverQueuedDeploymentExecution } from "@/lib/providers/execution-extension";
import { DATA_FOR_SEO_NO_SEARCH_RESULTS_STATUS } from "@/lib/providers/serp/dataforseo-payload";

export function explicitQueuedGetCostCents(
  data: { tasks?: Array<{ id?: string; cost?: number; status_code?: number }> },
  providerTaskId: string,
) {
  const matches = data.tasks?.filter((task) => task.id === providerTaskId) ?? [];
  if (matches.length !== 1) throw new Error("Queued TaskGET native identity does not match.");
  // A successful GET envelope can still contain an unfinished task or a lookup error.
  if (
    matches[0].status_code !== 20000 &&
    matches[0].status_code !== DATA_FOR_SEO_NO_SEARCH_RESULTS_STATUS &&
    matches[0].status_code !== 40501
  )
    return null;
  const value = matches[0].cost;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Number((value * 100).toFixed(4))
    : null;
}

export async function queuedHostedRecovery(task: { batchId: string; providerTag: string | null }) {
  if (!task.providerTag?.includes(";cs=hosted;")) return null;
  const recovery = await recoverQueuedDeploymentExecution(task.batchId);
  if (!recovery) throw new Error("Queued hosted execution is unavailable.");
  return recovery;
}

export async function finishQueuedHostedExecutionIfPresent(batchId: string) {
  const hostedTask = await prisma.queuedRankCheckTask.findFirst({
    select: { id: true },
    where: { batchId, providerTag: { contains: ";cs=hosted;" } },
  });
  if (hostedTask) await (await recoverQueuedDeploymentExecution(batchId))?.finish();
}
