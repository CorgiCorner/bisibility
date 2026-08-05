function optionalEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export type TemporalDeploymentConfig = {
  alertDeliveryTaskQueue: string;
  deploymentSuffix?: string;
  namespace: string;
  taskQueue: string;
};

export function temporalDeploymentConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): TemporalDeploymentConfig {
  const deploymentSuffix = optionalEnv(env.BISIBILITY_DEPLOYMENT_SUFFIX);
  const namespace =
    optionalEnv(env.TEMPORAL_NAMESPACE) ??
    (deploymentSuffix ? `bisibility-${deploymentSuffix}` : "default");
  const taskQueue =
    optionalEnv(env.TEMPORAL_TASK_QUEUE) ??
    (deploymentSuffix ? `bisibility-rank-checks-${deploymentSuffix}` : "rank-checks");
  const alertDeliveryTaskQueue =
    optionalEnv(env.TEMPORAL_ALERT_DELIVERY_TASK_QUEUE) ??
    (deploymentSuffix ? `bisibility-alert-deliveries-${deploymentSuffix}` : "alert-deliveries");

  return {
    alertDeliveryTaskQueue,
    ...(deploymentSuffix ? { deploymentSuffix } : {}),
    namespace,
    taskQueue,
  };
}
