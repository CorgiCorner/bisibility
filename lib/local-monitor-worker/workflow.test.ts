import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ execute: vi.fn(), sleep: vi.fn(), again: vi.fn(), proxy: vi.fn() }));
vi.mock("@temporalio/workflow", () => ({
  proxyActivities: (options: unknown) => {
    f.proxy(options);
    return { executeLocalMonitorIntentActivity: f.execute };
  },
  sleep: f.sleep,
  continueAsNew: f.again,
}));

import { localMonitorRunWorkflow } from "@/lib/temporal/local-monitor-workflow";

beforeEach(() => {
  f.execute.mockReset();
  f.sleep.mockReset();
  f.again.mockReset();
});
describe("existing Temporal worker owns one durable Local intent", () => {
  it("carries only the opaque intent ID and sleeps between pending collections", async () => {
    f.execute
      .mockResolvedValueOnce({ state: "pending", nextPollMs: 60000 })
      .mockResolvedValueOnce({ state: "complete", nextPollMs: null });
    await localMonitorRunWorkflow({ id: "intent" });
    expect(f.execute.mock.calls).toEqual([[{ id: "intent" }], [{ id: "intent" }]]);
    expect(f.sleep).toHaveBeenCalledExactlyOnceWith(60000);
  });
  it("stops on blocked receipt without a paid retry", async () => {
    f.execute.mockResolvedValue({ state: "blocked", nextPollMs: null });
    await localMonitorRunWorkflow({ id: "intent" });
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.sleep).not.toHaveBeenCalled();
  });
  it("continues with the same identity before workflow history grows", async () => {
    f.execute.mockResolvedValue({ state: "pending", nextPollMs: 30000 });
    await localMonitorRunWorkflow({ id: "intent", polls: 19 });
    expect(f.again).toHaveBeenCalledExactlyOnceWith({ id: "intent", polls: 0 });
  });
});
