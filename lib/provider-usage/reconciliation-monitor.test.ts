import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ freshness: vi.fn(), notify: vi.fn() }));
vi.mock("./usage-freshness", () => ({ providerUsageFreshness: mocks.freshness }));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: mocks.notify }));

import { monitorProviderUsageReconciliation } from "./reconciliation-monitor";

const started = new Date("2026-09-22T12:00:00Z");
describe("provider usage reconciliation watchdog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("alerts on a stalled sweep independently of the reconciliation activity", async () => {
    mocks.freshness.mockResolvedValue({ status: "stale", lastReconciledAt: null });
    await monitorProviderUsageReconciliation(started, new Date("2026-09-22T12:16:00Z"));
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "provider_usage_reconciliation_stale", severity: "error" }),
    );
  });
  it("allows the initial 15 minute startup window", async () => {
    mocks.freshness.mockResolvedValue({ status: "stale", lastReconciledAt: null });
    await monitorProviderUsageReconciliation(started, new Date("2026-09-22T12:15:00Z"));
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("does not alert for a completed fresh sweep", async () => {
    mocks.freshness.mockResolvedValue({
      status: "fresh",
      lastReconciledAt: "2026-09-22T12:14:00Z",
    });
    await monitorProviderUsageReconciliation(started, new Date("2026-09-22T12:16:00Z"));
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
