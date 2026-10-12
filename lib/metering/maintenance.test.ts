import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ expire: vi.fn(), notify: vi.fn() }));
vi.mock("./runtime", () => ({
  meteringNamespace: () => "test",
  meteringRuntime: async () => ({ meter: { expireReservations: mocks.expire } }),
}));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: mocks.notify }));

import { maintainMeteringReservations } from "./maintenance";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.notify.mockResolvedValue(undefined);
  vi.stubEnv("METERING_SHADOW", "off");
});
it("expires one bounded authoritative page regardless of the retired shadow flag", async () => {
  mocks.expire.mockResolvedValue({ outcome: "expired", count: 100, hasMore: true });
  await expect(maintainMeteringReservations()).resolves.toEqual({ count: 100, hasMore: true });
  expect(mocks.expire).toHaveBeenCalledWith({ namespace: "test", limit: 100 });
});
it("exposes accounting failure for activity retry and reports operational health", async () => {
  mocks.expire.mockRejectedValue(new Error("Store unavailable"));
  await expect(maintainMeteringReservations()).rejects.toThrow("Store unavailable");
  expect(mocks.notify).toHaveBeenCalledWith(
    expect.objectContaining({ severity: "error", kind: "metering_maintenance_failed" }),
  );
});
it("rejects an unsuccessful Meter expiry result", async () => {
  mocks.expire.mockResolvedValue({ outcome: "invalid", issues: [] });
  await expect(maintainMeteringReservations()).rejects.toThrow("expiry refused");
});
