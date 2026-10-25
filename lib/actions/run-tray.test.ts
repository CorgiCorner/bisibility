import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), scope: vi.fn(), dismiss: vi.fn() }));
vi.mock("./_shared", () => ({
  getActionActor: mocks.actor,
  requireProjectScope: mocks.scope,
  parseActionInput: (schema: { parse: (value: unknown) => unknown }, value: unknown) =>
    schema.parse(value),
}));
vi.mock("@/lib/rank-check/runs/recent", () => ({ dismissRecentRun: mocks.dismiss }));

vi.mock("@/lib/notifications/realtime", () => ({
  publishOperationChanged: vi.fn(async () => ({ ok: true })),
}));

import { dismissTrayRun } from "./run-tray";

const input = { projectId: "prj_abcdefghijklmnopqrstuvwx", runId: "rcr_abcdefghijklmnopqrstuvwx" };
describe("tray dismissal authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.actor.mockResolvedValue({ id: "own-user" });
    mocks.scope.mockResolvedValue({ id: "readable-project" });
    mocks.dismiss.mockResolvedValue({ dismissed: true });
  });
  it("uses the authenticated user and server-resolved readable project", async () => {
    await dismissTrayRun(input);
    expect(mocks.scope).toHaveBeenCalledWith({ id: "own-user" }, "read", input.projectId, {
      type: "project",
    });
    expect(mocks.dismiss).toHaveBeenCalledWith("readable-project", "own-user", input.runId);
  });
  it("rejects unreadable projects and client-selected users", async () => {
    mocks.scope.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(dismissTrayRun(input)).rejects.toThrow("Forbidden");
    await expect(dismissTrayRun({ ...input, userId: "victim" })).rejects.toThrow();
    expect(mocks.dismiss).not.toHaveBeenCalled();
  });
  it("rejects malformed run identity", async () => {
    await expect(dismissTrayRun({ ...input, runId: "internal-id" })).rejects.toThrow();
    expect(mocks.dismiss).not.toHaveBeenCalled();
  });
});
