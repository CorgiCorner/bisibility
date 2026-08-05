import { describe, expect, it } from "vitest";
import { temporalDeploymentConfig } from "./deployment-config";

describe("temporalDeploymentConfig", () => {
  it("preserves the existing deployment defaults", () => {
    expect(temporalDeploymentConfig({})).toEqual({
      alertDeliveryTaskQueue: "alert-deliveries",
      namespace: "default",
      taskQueue: "rank-checks",
    });
  });

  it("derives all deployment-scoped identifiers from one suffix", () => {
    expect(temporalDeploymentConfig({ BISIBILITY_DEPLOYMENT_SUFFIX: "a1b2c3d4" })).toEqual({
      alertDeliveryTaskQueue: "bisibility-alert-deliveries-a1b2c3d4",
      deploymentSuffix: "a1b2c3d4",
      namespace: "bisibility-a1b2c3d4",
      taskQueue: "bisibility-rank-checks-a1b2c3d4",
    });
  });

  it("keeps explicit identifier overrides", () => {
    expect(
      temporalDeploymentConfig({
        BISIBILITY_DEPLOYMENT_SUFFIX: "suffix",
        TEMPORAL_ALERT_DELIVERY_TASK_QUEUE: "alerts-custom",
        TEMPORAL_NAMESPACE: "namespace-custom",
        TEMPORAL_TASK_QUEUE: "rank-custom",
      }),
    ).toMatchObject({
      alertDeliveryTaskQueue: "alerts-custom",
      namespace: "namespace-custom",
      taskQueue: "rank-custom",
    });
  });
});
