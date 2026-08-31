import { describe, expect, it } from "vitest";
import { compareWorkerTemporalIdentity } from "./worker-temporal-identity";

const app = {
  alertDeliveryTaskQueue: "bisibility-alert-deliveries-e7a7bfa7",
  namespace: "bisibility-e7a7bfa7",
  taskQueue: "bisibility-rank-checks-e7a7bfa7",
};

describe("compareWorkerTemporalIdentity", () => {
  it("reports matching resolved identities", () => {
    expect(compareWorkerTemporalIdentity(app, app)).toEqual({
      detail:
        "app: bisibility-e7a7bfa7 / bisibility-rank-checks-e7a7bfa7 / bisibility-alert-deliveries-e7a7bfa7 · worker: bisibility-e7a7bfa7 / bisibility-rank-checks-e7a7bfa7 / bisibility-alert-deliveries-e7a7bfa7",
      status: "match",
    });
  });

  it("diagnoses an alert-delivery-only mismatch", () => {
    expect(
      compareWorkerTemporalIdentity(app, {
        ...app,
        alertDeliveryTaskQueue: "alert-deliveries",
      }),
    ).toEqual({
      detail:
        "app: bisibility-e7a7bfa7 / bisibility-rank-checks-e7a7bfa7 / bisibility-alert-deliveries-e7a7bfa7 · worker: bisibility-e7a7bfa7 / bisibility-rank-checks-e7a7bfa7 / alert-deliveries",
      status: "mismatch",
    });
  });

  it("reports unknown when a legacy heartbeat has no identity", () => {
    expect(
      compareWorkerTemporalIdentity(app, {
        alertDeliveryTaskQueue: null,
        namespace: null,
        taskQueue: null,
      }),
    ).toEqual({
      detail:
        "app: bisibility-e7a7bfa7 / bisibility-rank-checks-e7a7bfa7 / bisibility-alert-deliveries-e7a7bfa7 · worker: unknown / unknown / unknown",
      status: "unknown",
    });
  });
});
