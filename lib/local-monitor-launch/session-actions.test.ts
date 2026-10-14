import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  actor: vi.fn(),
  preview: vi.fn(),
  launch: vi.fn(),
  read: vi.fn(),
  factory: vi.fn(),
}));
vi.mock("@/lib/actions/_shared", () => ({ getActionActor: f.actor }));
vi.mock("@/lib/local-monitoring-host/manual-driver", () => ({
  resolveManualLocalDriver: f.factory,
}));
vi.mock("./service", () => ({
  previewMonitorFor: f.preview,
  launchMonitorFor: f.launch,
  readMonitorLaunchFor: f.read,
}));

import {
  launchMonitorAction,
  previewMonitorLaunchAction,
  readMonitorLaunchAction,
} from "./session-actions";

beforeEach(() => {
  vi.clearAllMocks();
  f.actor.mockResolvedValue({ id: "verified-session" });
});
describe("monitor session authority", () => {
  it("obtains the actor server-side and supplies only the registered factory", async () => {
    const command = { actor: { id: "forged" }, targetIds: ["target"] };
    await previewMonitorLaunchAction(command);
    expect(f.preview).toHaveBeenCalledExactlyOnceWith(
      command,
      { actor: { id: "verified-session" } },
      f.factory,
    );
  });
  it("enqueues with the trusted session without an execution factory", async () => {
    const command = { request: "opaque" };
    await launchMonitorAction(command);
    expect(f.launch).toHaveBeenCalledExactlyOnceWith(command, {
      actor: { id: "verified-session" },
    });
  });
  it("does not supply an execution factory during reads", async () => {
    const command = { projectId: "project", monitorId: "monitor" };
    await readMonitorLaunchAction(command);
    expect(f.read).toHaveBeenCalledExactlyOnceWith(command, {
      actor: { id: "verified-session" },
    });
    expect(f.factory).not.toHaveBeenCalled();
    expect(f.launch).not.toHaveBeenCalled();
    expect(f.preview).not.toHaveBeenCalled();
  });
  it("does no work when session authentication fails", async () => {
    f.actor.mockRejectedValue(new Error("unauthenticated"));
    await expect(launchMonitorAction({})).rejects.toThrow("unauthenticated");
    expect(f.launch).not.toHaveBeenCalled();
    expect(f.factory).not.toHaveBeenCalled();
  });
});
