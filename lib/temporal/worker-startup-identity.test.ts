import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { temporalDeploymentConfig } from "./deployment-config";
import { logWorkerStartupIdentity, warnMissingDemoConfig } from "./worker-startup-identity";

describe("logWorkerStartupIdentity", () => {
  it("logs the deployment config identity tuple at info once", () => {
    const deploymentConfig = temporalDeploymentConfig({
      BISIBILITY_DEPLOYMENT_SUFFIX: "test-deployment",
      TEMPORAL_ALERT_DELIVERY_TASK_QUEUE: "alerts-test",
      TEMPORAL_NAMESPACE: "namespace-test",
      TEMPORAL_TASK_QUEUE: "rank-test",
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const identity = logWorkerStartupIdentity(deploymentConfig);

    expect(identity).toEqual({
      alertDeliveryTaskQueue: deploymentConfig.alertDeliveryTaskQueue,
      namespace: deploymentConfig.namespace,
      taskQueue: deploymentConfig.taskQueue,
    });
    expect(info).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith("[temporal] worker startup identity", identity);
  });
});

describe("worker startup diagnostics", () => {
  it("retains the detailed startup config and logs startup identity exactly once", () => {
    const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "worker.ts");
    const source = fs.readFileSync(workerPath, "utf8");

    expect(source.match(/logWorkerStartupIdentity\(deploymentConfig\)/g)).toHaveLength(1);
    expect(source).toContain("warnMissingDemoConfig(namespace);");
    expect(source).toContain('console.error("[temporal] worker startup config", {');
    expect(source).toContain("address,");
    expect(source).toContain("namespace,");
    expect(source).toContain("rank_check_scheduler_mode: schedulerMode,");
    expect(source).toContain("scheduler_driver: schedulerDriverValue,");
    expect(source).toContain(
      "const taskQueues = [taskQueue, deliveryTaskQueue, fencedDigestTaskQueue(deliveryTaskQueue)];",
    );
    expect(source).toContain("task_queues: taskQueues,");
    expect(source).toContain("tls: connectionOptions.tls ?? false,");
    expect(source).toContain("tls_source: connectionOptions.tlsSource,");
    expect(source).toContain('console.error("[temporal] rank-check runs schedule", {');
    expect(source).toContain("decision: rankCheckRunsDecision.reason,");
    expect(source).toContain('scheduleId: "maintenance-rank-check-runs",');
    expect(source).toContain('status: rankCheckRunsSchedule?.status ?? "failed",');
  });
});

it("warns only for a demo namespace without demo mode", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  warnMissingDemoConfig("bisibility-demo", {});
  expect(error).toHaveBeenCalledOnce();
  error.mockClear();
  warnMissingDemoConfig("bisibility-demo", { DEMO_MODE: "editable" });
  warnMissingDemoConfig("default", {});
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});
