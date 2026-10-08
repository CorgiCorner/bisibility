import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ownAdmission } from "@/lib/provider-usage/admission-extension";
import { explicitQueuedGetCostCents } from "./queued-hosted-results";
import type { QueuedTask } from "./queued-results-load";

export async function recoverOwnQueuedResult(
  task: QueuedTask,
  data: Parameters<typeof explicitQueuedGetCostCents>[0],
  failed: boolean,
) {
  if (!task.providerTaskId || !task.batch.connection)
    throw new Error("Own-key queued proof identity is unavailable");
  await prisma.$transaction((tx) =>
    ownAdmission.recover(tx, task.batch.connection?.id ?? "", task.id, {
      costCents: explicitQueuedGetCostCents(data, task.providerTaskId as string),
      quantity: 1,
      cached: false,
      failed,
      providerRequestId: task.providerTaskId as string,
    }),
  );
}
