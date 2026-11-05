import { demoModeDeclared } from "@/lib/demo/config";
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

export function warnMissingDemoConfig(
  namespace: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (namespace.toLowerCase().includes("demo") && !demoModeDeclared(env)) {
    console.error(
      "[temporal] demo worker has no demo mode configuration; notification mail is unsafe.",
    );
  }
}
