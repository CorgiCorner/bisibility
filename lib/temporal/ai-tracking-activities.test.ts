import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cancel: vi.fn(), samples: vi.fn(), execute: vi.fn() }));
vi.mock("../db/prisma", () => ({ prisma: { aiTrackingSample: { findMany: mocks.samples } } }));
vi.mock("../ai-tracking/stores/runs", () => ({ cancelTrackingRun: mocks.cancel }));
vi.mock("../ai-tracking/execution/runtime", () => ({ runTrackingSample: mocks.execute }));
vi.mock("../ai-tracking/scheduling/sweep", () => ({ planDueTrackingSchedules: vi.fn() }));

import { samplePlan } from "../ai-tracking/execution/fixture";
import { collectAiTrackingRunActivity } from "./ai-tracking-activities";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cancel.mockResolvedValue(undefined);
  mocks.samples.mockResolvedValue([{ id: "sample", plan: samplePlan() }]);
  mocks.execute.mockResolvedValue("terminal");
});
it("cancellation closes new dispatch before selecting and force-collecting only purchased tasks", async () => {
  const result = await collectAiTrackingRunActivity({
    projectId: "project",
    runId: "run",
    collectionOnly: true,
  });
  expect(mocks.cancel).toHaveBeenCalledWith("project", "run");
  expect(mocks.cancel.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.samples.mock.invocationCallOrder[0],
  );
  expect(mocks.samples).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        projectId: "project",
        runId: "run",
        dispatch: { not: "terminal" },
        providerTaskId: { not: null },
      },
    }),
  );
  expect(mocks.execute).toHaveBeenCalledWith("project", "sample", { forceCollection: true });
  expect(result).toMatchObject({ pending: 0, terminal: 1 });
});
