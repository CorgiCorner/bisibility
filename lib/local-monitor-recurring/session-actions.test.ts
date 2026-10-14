import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  actor: vi.fn(),
  read: vi.fn(),
  preview: vi.fn(),
  approve: vi.fn(),
  pause: vi.fn(),
}));
vi.mock("@/lib/actions/_shared", () => ({ getActionActor: f.actor }));
vi.mock("./read", () => ({ readRecurringMonitor: f.read }));
vi.mock("./service", () => ({
  previewRecurringFor: f.preview,
  approveRecurringFor: f.approve,
  pauseRecurringFor: f.pause,
}));

import {
  approveRecurringMonitorAction,
  pauseRecurringMonitorAction,
  previewRecurringMonitorAction,
  readRecurringMonitorAction,
} from "./session-actions";

beforeEach(() => {
  vi.resetAllMocks();
  f.actor.mockResolvedValue({ id: "verified-session" });
});
describe("recurring trusted session bridge", () => {
  it.each([
    [previewRecurringMonitorAction, f.preview],
    [approveRecurringMonitorAction, f.approve],
    [pauseRecurringMonitorAction, f.pause],
  ] as const)("derives actor rather than accepting a client owner", async (action, port) => {
    const input = { opaque: "input", actorId: "attacker" };
    await action(input);
    expect(port).toHaveBeenCalledWith(input, { actor: { id: "verified-session" } });
  });
  it("reads through fresh session authority only", async () => {
    await readRecurringMonitorAction("project", "monitor");
    expect(f.read).toHaveBeenCalledWith(
      { projectId: "project", monitorId: "monitor" },
      { actor: { id: "verified-session" } },
    );
    expect(f.approve).not.toHaveBeenCalled();
    expect(f.preview).not.toHaveBeenCalled();
  });
  it("cannot reach any write/read port when authentication fails", async () => {
    f.actor.mockRejectedValue(new Error("unauthenticated"));
    await expect(approveRecurringMonitorAction({})).rejects.toThrow();
    expect(f.approve).not.toHaveBeenCalled();
  });
});
