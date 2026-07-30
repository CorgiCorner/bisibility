import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reconcileAllSchedules: vi.fn(),
}));

vi.mock("../rank-check/reconciler", () => ({
  reconcileAllSchedules: mocks.reconcileAllSchedules,
}));

import { reconcileAllSchedulesActivity } from "./reconcile-activities";

describe("reconcileAllSchedulesActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to the reconciler exactly once", async () => {
    const result = { created: 1, deleted: 2, failed: 0, listed: 4, scanned: 6, updated: 5 };
    mocks.reconcileAllSchedules.mockResolvedValue(result);

    await expect(reconcileAllSchedulesActivity()).resolves.toBe(result);

    expect(mocks.reconcileAllSchedules).toHaveBeenCalledTimes(1);
    expect(mocks.reconcileAllSchedules).toHaveBeenCalledWith();
  });
});
