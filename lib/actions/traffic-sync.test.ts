import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncProjectTraffic } from "./traffic-sync";

const mocks = vi.hoisted(() => ({
  sync: vi.fn(),
  actor: vi.fn(),
  scope: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/traffic/sync-now", () => ({ syncProjectTrafficNow: mocks.sync }));
vi.mock("./_shared", () => ({
  getActionActor: mocks.actor,
  requireProjectScope: mocks.scope,
  revalidateKeywordViews: mocks.revalidate,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: "actor" });
  mocks.scope.mockResolvedValue({ id: "project_internal" });
});
describe("manual analytics action", () => {
  it("authorizes the project, retains source outcomes and refreshes keyword views", async () => {
    const result = {
      connections: 1,
      keywordSnapshots: 0,
      pageSnapshots: 2,
      runs: [{ status: "succeeded_with_data" }, { status: "failed" }],
    };
    mocks.sync.mockResolvedValue(result);
    expect(await syncProjectTraffic({ projectId: "prj_1" })).toBe(result);
    expect(mocks.scope).toHaveBeenCalledWith({ id: "actor" }, "update", "prj_1", {
      type: "project",
    });
    expect(mocks.sync).toHaveBeenCalledExactlyOnceWith({
      actorId: "actor",
      projectId: "project_internal",
    });
    expect(mocks.revalidate).toHaveBeenCalledOnce();
  });
  it("does not call a provider when project access is denied", async () => {
    mocks.scope.mockRejectedValueOnce(new Error("forbidden"));
    await expect(syncProjectTraffic({ projectId: "prj_1" })).rejects.toThrow("forbidden");
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
