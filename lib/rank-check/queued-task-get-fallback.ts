import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { recoverQueuedDeploymentExecution } from "@/lib/providers/execution-extension";
import { DataForSeoError } from "@/lib/providers/serp/dataforseo-errors";
import {
  fetchDataForSeoQueuedResult,
  legacyDataForSeoQueuedTaskTag,
} from "@/lib/providers/serp/dataforseo-queued";
import type { ProviderCredentials } from "@/lib/providers/types";
import { queuedRankCheckConfig } from "./queued-config";
import { dataForSeoQueuedResponseTask, pollDataForSeoQueue } from "./queued-provider-poll";

export async function inspectQueuedTaskGetFallback(input: {
  batchId: string;
  projectId: string;
  credentials: ProviderCredentials;
  recovery: Awaited<ReturnType<typeof recoverQueuedDeploymentExecution>>;
  readyIds: string[];
  deadlineAt?: Date;
  signal?: AbortSignal;
}) {
  const tasks = await prisma.queuedRankCheckTask.findMany({
    where: {
      batchId: input.batchId,
      state: "submitted",
      providerTaskId: { not: null },
      updatedAt: {
        lt: new Date(Date.now() - queuedRankCheckConfig().taskGetFallbackSeconds * 1000),
      },
      id: { notIn: input.readyIds },
    },
    select: { id: true, providerTag: true, providerTaskId: true },
    orderBy: { id: "asc" },
    take: 10,
  });
  for (const task of tasks) {
    if (!task.providerTaskId) continue;
    const polled = await pollDataForSeoQueue(
      input.credentials,
      input.projectId,
      () =>
        fetchDataForSeoQueuedResult(input.credentials, task.providerTaskId as string, {
          signal: input.signal,
        }),
      { deadlineAt: input.deadlineAt },
    ).catch((error) => {
      if (input.signal?.aborted) throw input.signal.reason ?? error;
      if (!(error instanceof DataForSeoError)) throw error;
      return { status: "pending" as const };
    });
    if (polled.status !== "ready") return polled.status;
    const result = dataForSeoQueuedResponseTask(polled.value, task.providerTaskId);
    const code = result?.status_code;
    if (
      typeof code !== "number" ||
      (code >= 20100 && code < 20200) ||
      code === 40601 ||
      code === 40602
    )
      continue;
    await input.recovery?.bindReadyTask(
      task.id,
      task.providerTag ?? legacyDataForSeoQueuedTaskTag(task.id),
      task.providerTaskId,
    );
    await prisma.queuedRankCheckTask.updateMany({
      data: { state: "ready", error: null },
      where: { id: task.id, state: { in: ["submitted"] } },
    });
  }
  return "done" as const;
}
