import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ health: vi.fn(), notify: vi.fn() }));
vi.mock("./reconciliation-health", () => ({ readReconciliationHealth: mocks.health }));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: mocks.notify }));

import { monitorProviderUsageReconciliation } from "./reconciliation-monitor";

const started = new Date("2026-09-22T12:00:00Z");
describe("provider usage reconciliation watchdog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("alerts on a stalled sweep independently of the reconciliation activity", async () => {
    mocks.health.mockResolvedValue(null);
    await monitorProviderUsageReconciliation(started, new Date("2026-09-22T12:16:00Z"));
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "provider_usage_reconciliation_stale", severity: "error" }),
    );
  });
  it("allows the initial 15 minute startup window", async () => {
    mocks.health.mockResolvedValue(null);
    await monitorProviderUsageReconciliation(started, new Date("2026-09-22T12:15:00Z"));
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("does not alert for a completed fresh sweep", async () => {
    mocks.health.mockResolvedValue({
      lastActivityAt: "2026-09-22T12:14:00Z",
    });
    await monitorProviderUsageReconciliation(started, new Date("2026-09-22T12:16:00Z"));
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("keeps a sweep with persistent recovery errors live without claiming clean accounting", async () => {
    mocks.health.mockResolvedValue({
      lastActivityAt: "2026-09-22T12:14:00Z",
      failed: 2,
      lastCleanAt: null,
    });
    await monitorProviderUsageReconciliation(started, new Date("2026-09-22T12:16:00Z"));
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
