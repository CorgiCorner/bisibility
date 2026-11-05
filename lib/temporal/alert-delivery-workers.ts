import { fileURLToPath } from "node:url";
import { Worker, type WorkerOptions } from "@temporalio/worker";
import { fencedDigestTaskQueue } from "./digest-fencing";
import * as fencedDigestActivities from "./fenced-digest-activities";
import { maxConcurrentActivities } from "./worker-config";

export async function createAlertDeliveryWorkers(
  options: { mainTaskQueue: string } & Pick<
    WorkerOptions,
    "activities" | "connection" | "identity" | "namespace" | "taskQueue"
  >,
) {
  const { mainTaskQueue, ...workerOptions } = options;
  const shared = {
    ...workerOptions,
    maxConcurrentActivityTaskExecutions: maxConcurrentActivities(),
    workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
  };
  const worker = await Worker.create({ ...shared, taskQueue: mainTaskQueue });
  const deliveryWorker = await Worker.create(shared);
  const fencedDigestWorker = await Worker.create({
    ...shared,
    activities: fencedDigestActivities,
    taskQueue: fencedDigestTaskQueue(options.taskQueue),
  });
  return { worker, deliveryWorker, fencedDigestWorker };
}
