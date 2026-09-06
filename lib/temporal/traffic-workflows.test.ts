import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  syncFirstTrafficIntentActivity: vi.fn(),
}));

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: vi.fn(() => mocks),
}));

import { syncFirstTrafficWorkflow } from "./traffic-workflows";

describe("first traffic sync workflow", () => {
  it("delegates one claimed intent to the traffic activity", async () => {
    const input = {
      connectionId: "connection_1",
      firstSyncRequestedAt: "2026-09-04T10:00:00.000Z",
      firstSyncStartedAt: "2026-09-04T10:00:01.000Z",
      projectId: "project_1",
      reclaimed: false,
    };
    mocks.syncFirstTrafficIntentActivity.mockResolvedValue({ status: "finished" });

    await expect(syncFirstTrafficWorkflow(input)).resolves.toEqual({ status: "finished" });

    expect(mocks.syncFirstTrafficIntentActivity).toHaveBeenCalledWith(input);
  });
});
