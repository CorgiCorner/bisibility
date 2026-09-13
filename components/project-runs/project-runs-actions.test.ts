import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  scope: vi.fn(),
  remove: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.actor,
  requireProjectScope: mocks.scope,
}));
vi.mock("@/lib/queries/rank-check-runs", () => ({ getRankCheckRunCommand: vi.fn() }));
vi.mock("@/lib/rank-check/runs/cancel-run", () => ({
  deleteRankCheckRunCommand: mocks.remove,
  skipRankCheckRunCommand: vi.fn(),
}));
vi.mock("@/lib/rank-check/runs/run-now", () => ({ runRankCheckRunNowCommand: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { deleteProjectRun } from "./project-runs-actions";

const input = { projectRef: "prj_abcdefghijklmnopqrstuvwx", runId: "rcr_abcdefghijklmnopqrstuvwx" };
describe("deleteProjectRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ id: "user_1" });
    mocks.scope.mockResolvedValue({ id: "project_1" });
  });
  it("requires delete permission and uses the authorized internal project id", async () => {
    await deleteProjectRun(input);
    expect(mocks.scope).toHaveBeenCalledWith({ id: "user_1" }, "delete", input.projectRef, {
      type: "keyword",
    });
    expect(mocks.remove).toHaveBeenCalledWith({
      actorId: "user_1",
      projectId: "project_1",
      publicId: input.runId,
    });
    expect(mocks.revalidate).toHaveBeenCalled();
  });
  it("does not mutate when authorization or write mode rejects the request", async () => {
    mocks.scope.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(deleteProjectRun(input)).rejects.toThrow("Forbidden");
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("rejects invalid run identifiers before authorization", async () => {
    await expect(deleteProjectRun({ ...input, runId: "internal_1" })).rejects.toThrow("not found");
    expect(mocks.actor).not.toHaveBeenCalled();
  });
});
