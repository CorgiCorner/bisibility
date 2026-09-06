import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activity: vi.fn(),
  continueAsNew: vi.fn(),
}));

vi.mock("@temporalio/workflow", () => ({
  continueAsNew: mocks.continueAsNew,
  proxyActivities: vi.fn(() => ({ reconcileRankCheckRunsActivity: mocks.activity })),
}));

import { reconcileRankCheckRunsWorkflow } from "./rank-check-run-maintenance-workflows";

describe("reconcileRankCheckRunsWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("continues with the original sweep timestamp and accumulated count", async () => {
    mocks.activity.mockResolvedValue({
      hasMore: true,
      reconciled: 100,
      sweepAt: "2026-09-02T08:00:00.000Z",
    });

    await reconcileRankCheckRunsWorkflow();

    expect(mocks.continueAsNew).toHaveBeenCalledWith({
      reconciled: 100,
      sweepAt: "2026-09-02T08:00:00.000Z",
    });
  });

  it("returns the accumulated result on the final page", async () => {
    mocks.activity.mockResolvedValue({
      hasMore: false,
      reconciled: 7,
      sweepAt: "2026-09-02T08:00:00.000Z",
    });

    await expect(
      reconcileRankCheckRunsWorkflow({
        reconciled: 100,
        sweepAt: "2026-09-02T08:00:00.000Z",
      }),
    ).resolves.toEqual({ reconciled: 107, sweepAt: "2026-09-02T08:00:00.000Z" });
  });
});
