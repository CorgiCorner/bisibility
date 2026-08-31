import type { TemporalDeploymentConfig } from "./deployment-config";

export type WorkerStartupIdentity = Pick<
  TemporalDeploymentConfig,
  "alertDeliveryTaskQueue" | "namespace" | "taskQueue"
>;

export function workerStartupIdentity(
  deploymentConfig: TemporalDeploymentConfig,
): WorkerStartupIdentity {
  return {
    alertDeliveryTaskQueue: deploymentConfig.alertDeliveryTaskQueue,
    namespace: deploymentConfig.namespace,
    taskQueue: deploymentConfig.taskQueue,
  };
}

export function logWorkerStartupIdentity(
  deploymentConfig: TemporalDeploymentConfig,
): WorkerStartupIdentity {
  const identity = workerStartupIdentity(deploymentConfig);
  console.info("[temporal] worker startup identity", identity);
  return identity;
}
