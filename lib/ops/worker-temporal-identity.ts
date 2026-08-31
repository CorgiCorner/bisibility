import type { TemporalDeploymentConfig } from "@/lib/temporal/deployment-config";

export type WorkerTemporalIdentity = {
  alertDeliveryTaskQueue: string | null;
  namespace: string | null;
  taskQueue: string | null;
};

export type WorkerTemporalIdentityComparison = {
  detail: string;
  status: "match" | "mismatch" | "unknown";
};

export type WorkerTemporalHealth = {
  status: "ok" | "stale" | "unknown";
  temporalIdentityComparison: WorkerTemporalIdentityComparison;
};

export type WorkerTemporalStatus = WorkerTemporalHealth["status"] | WorkerTemporalHealth;

function compactIdentity(identity: WorkerTemporalIdentity) {
  return `${identity.namespace ?? "unknown"} / ${identity.taskQueue ?? "unknown"} / ${identity.alertDeliveryTaskQueue ?? "unknown"}`;
}

export function compareWorkerTemporalIdentity(
  app: TemporalDeploymentConfig,
  worker: WorkerTemporalIdentity,
): WorkerTemporalIdentityComparison {
  const detail = `app: ${compactIdentity(app)} · worker: ${compactIdentity(worker)}`;
  if (!worker.namespace || !worker.taskQueue || !worker.alertDeliveryTaskQueue) {
    return { detail, status: "unknown" };
  }
  const status =
    app.namespace === worker.namespace &&
    app.taskQueue === worker.taskQueue &&
    app.alertDeliveryTaskQueue === worker.alertDeliveryTaskQueue
      ? "match"
      : "mismatch";
  return { detail, status };
}
