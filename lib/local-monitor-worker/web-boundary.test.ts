import { launchMonitor } from "@/lib/local-monitor-launch/launch";
import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ enqueue: vi.fn() }));
vi.mock("./enqueue", () => ({ enqueueMonitorLaunch: f.enqueue }));
beforeEach(() => vi.clearAllMocks());
describe("web Local launch is queue-only", () => {
  it("returns the durable intent receipt without preparing or executing anything", async () => {
    const receipt = { replayed: false, intent: { id: "job", state: "queued", expectedCount: 18 } };
    f.enqueue.mockResolvedValue(receipt);
    const context = { actor: { id: "verified" } };
    expect(await launchMonitor({ signed: "command" }, context)).toBe(receipt);
    expect(f.enqueue).toHaveBeenCalledExactlyOnceWith({ signed: "command" }, context, undefined);
  });
});
