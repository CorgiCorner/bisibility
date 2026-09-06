import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  isTrafficSyncEnabled: vi.fn(),
  start: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("../db/prisma", () => ({
  prisma: { providerConnection: { updateMany: mocks.updateMany } },
}));
vi.mock("../traffic/first-sync-intent-claim", () => ({
  claimFirstTrafficSyncIntent: mocks.claim,
}));
vi.mock("./traffic-sync-enabled", () => ({ isTrafficSyncEnabled: mocks.isTrafficSyncEnabled }));
vi.mock("./traffic-first-sync-client", () => ({
  startFirstTrafficSyncWorkflow: mocks.start,
}));

import { dispatchFirstTrafficSyncIntent } from "./traffic-intent-dispatch";

const claim = {
  firstSyncRequestedAt: new Date("2026-09-04T10:00:00.000Z"),
  firstSyncStartedAt: new Date("2026-09-04T10:00:01.000Z"),
  id: "connection_1",
  projectId: "project_1",
  reclaimed: false,
};

describe("traffic first-sync intent dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTrafficSyncEnabled.mockReturnValue(true);
    mocks.claim.mockResolvedValue(claim);
    mocks.start.mockResolvedValue({
      runId: "run_1",
      workflowId: "traffic-first-sync:connection_1",
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("starts a workflow only after the traffic CAS claim", async () => {
    await expect(dispatchFirstTrafficSyncIntent()).resolves.toMatchObject({
      connectionId: "connection_1",
      status: "started",
    });

    expect(mocks.claim.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.start.mock.invocationCallOrder[0],
    );
    expect(mocks.start).toHaveBeenCalledWith(claim);
  });

  it("releases the exact claim when the workflow cannot start", async () => {
    mocks.start.mockRejectedValue(new Error("Temporal unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(dispatchFirstTrafficSyncIntent()).resolves.toEqual({
      connectionId: "connection_1",
      status: "failed",
    });

    expect(mocks.updateMany).toHaveBeenCalledWith({
      data: { firstSyncStartedAt: null },
      where: {
        firstSyncFinishedAt: null,
        firstSyncRequestedAt: claim.firstSyncRequestedAt,
        firstSyncStartedAt: claim.firstSyncStartedAt,
        id: claim.id,
      },
    });
  });
});
