import { afterEach, describe, expect, it, vi } from "vitest";
import { date, window } from "./fixtures.test-support";
import { sweepCheckNotificationSummaries } from "./sweep";

const mocks = vi.hoisted(() => ({ projects: vi.fn(), runs: vi.fn(), recompute: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { project: { findMany: mocks.projects }, rankCheckRun: { findMany: mocks.runs } },
}));
vi.mock("./deliver", () => ({ recomputeCheckSummary: mocks.recompute }));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe("summary sweep", () => {
  it("runs the installed sweep without configuration", async () => {
    mocks.projects.mockResolvedValue([]);
    mocks.runs.mockResolvedValue([]);
    expect(await sweepCheckNotificationSummaries(date("07:05:00"))).toEqual({
      evaluated: 0,
      writes: 0,
    });
    expect(mocks.projects).toHaveBeenCalledOnce();
    expect(mocks.runs).toHaveBeenCalledOnce();
  });
  it("evaluates only live ends and terminal manual/retry runs, continuing after a project fails", async () => {
    mocks.projects.mockResolvedValue([{ id: "first" }, { id: "second" }]);
    mocks.runs.mockResolvedValue([{ id: "run", projectId: "second" }]);
    mocks.recompute.mockRejectedValueOnce(new Error("fixture")).mockResolvedValue(1);
    expect(await sweepCheckNotificationSummaries(date("07:05:00"))).toEqual({
      evaluated: 2,
      writes: 2,
    });
    expect(mocks.recompute).toHaveBeenNthCalledWith(1, {
      kind: "scheduled",
      projectId: "first",
      window,
    });
    expect(mocks.recompute).toHaveBeenLastCalledWith({
      kind: "manual",
      projectId: "second",
      runId: "run",
    });
    expect(mocks.runs).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          finishedAt: { gt: date("06:50:00"), lte: date("07:05:00") },
          trigger: { in: ["manual", "retry"] },
          deletedAt: null,
        }),
      }),
    );
  });
  it("never catches up an old hourly window after an outage or at its exact cutoff", async () => {
    mocks.runs.mockResolvedValue([]);
    for (const now of [date("07:15:00"), date("07:40:00")])
      await sweepCheckNotificationSummaries(now);
    expect(mocks.projects).not.toHaveBeenCalled();
    expect(mocks.recompute).not.toHaveBeenCalled();
  });
});
