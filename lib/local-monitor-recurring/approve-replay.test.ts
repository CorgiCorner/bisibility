import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { approveRecurringMonitor } from "./approve";
import { policy } from "./recurring.test-fixture";

const f = vi.hoisted(() => ({ write: vi.fn(), wake: vi.fn() }));
vi.mock("@/lib/local-monitor-store/schedule", () => ({ setLocalMonitorScheduleIntent: f.write }));
vi.mock("@/lib/worker-intents/realtime", () => ({ publishWorkerIntent: f.wake }));
const { actorId, internalProjectId, connectionStamp, definitionHash, ...publicBody } = policy;
const command = {
  ...publicBody,
  consentToken: "opaque signed token checked by the actual approval callback",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("LOCAL_MONITOR_RECURRING_ENABLED", "true");
  vi.stubEnv("SCHEDULER_DRIVER", "worker");
  f.write.mockResolvedValue({
    receipt: { monitorId: policy.monitorId, version: 2 },
    replayed: true,
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("whole-policy schedule request replay", () => {
  it("passes a different full-body hash when limits change under the same key/token", async () => {
    await approveRecurringMonitor(command, { actor: { id: "actor" } });
    const first = f.write.mock.calls[0][3].approvalBodyHash;
    await approveRecurringMonitor(
      { ...command, maximumTotalCents: "0.18" },
      { actor: { id: "actor" } },
    );
    expect(f.write.mock.calls[1][3].approvalBodyHash).not.toBe(first);
    expect(f.wake).toHaveBeenCalledTimes(2);
  });
  it("rejects client owner/actor fields instead of trusting them", async () => {
    await expect(
      approveRecurringMonitor({ ...command, actorId: "administrator" }, { actor: { id: "actor" } }),
    ).rejects.toThrow();
    expect(f.write).not.toHaveBeenCalled();
  });
  it("does not invoke approval storage while runtime is explicitly off", async () => {
    vi.stubEnv("LOCAL_MONITOR_RECURRING_ENABLED", "false");
    await expect(approveRecurringMonitor(command, { actor: { id: "actor" } })).rejects.toThrow(
      "disabled",
    );
    expect(f.write).not.toHaveBeenCalled();
  });
});
