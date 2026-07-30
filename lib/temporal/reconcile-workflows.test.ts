import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const activities = {
    reconcileAllSchedulesActivity: vi.fn(),
  };

  return {
    activities,
    proxyActivities: vi.fn(() => activities),
  };
});

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: mocks.proxyActivities,
}));

import { reconcileRankCheckSchedulesWorkflow } from "./reconcile-workflows";

describe("reconcileRankCheckSchedulesWorkflow", () => {
  beforeEach(() => {
    mocks.activities.reconcileAllSchedulesActivity.mockReset();
  });

  it("proxies the reconciler activity with retry options", () => {
    expect(mocks.proxyActivities).toHaveBeenCalledWith({
      retry: {
        backoffCoefficient: 2,
        initialInterval: "5 seconds",
        maximumAttempts: 3,
        maximumInterval: "30 seconds",
      },
      startToCloseTimeout: "2 minutes",
    });
  });

  it("delegates to the proxied reconciler activity", async () => {
    const result = { created: 1, deleted: 0, failed: 0, listed: 2, scanned: 6, updated: 3 };
    mocks.activities.reconcileAllSchedulesActivity.mockResolvedValue(result);

    await expect(reconcileRankCheckSchedulesWorkflow()).resolves.toBe(result);

    expect(mocks.activities.reconcileAllSchedulesActivity).toHaveBeenCalledTimes(1);
    expect(mocks.activities.reconcileAllSchedulesActivity).toHaveBeenCalledWith();
  });
});
