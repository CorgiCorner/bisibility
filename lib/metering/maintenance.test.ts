import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  expire: vi.fn(),
  notify: vi.fn(),
  stale: vi.fn(),
  stopped: vi.fn(),
}));
vi.mock("./runtime", () => ({
  meteringNamespace: () => "test",
  meteringRuntime: async () => ({ meter: { expireReservations: mocks.expire } }),
}));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: mocks.notify }));
vi.mock("@/lib/assistant/accounting-recovery", () => ({
  releaseStaleAssistantAttempts: mocks.stale,
}));
vi.mock("@/lib/assistant/stop-settlement", () => ({
  settleDueStoppedAssistantAttempts: mocks.stopped,
}));
vi.mock("@/lib/model-playground/funding-extension", () => ({
  maintainModelFunding: vi.fn(async () => ({ checked: 0, corrected: 0 })),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: async (body: (tx: object) => unknown) => body({}) },
}));

import { maintainMeteringReservations } from "./maintenance";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.notify.mockResolvedValue(undefined);
  mocks.stale.mockResolvedValue(0);
  mocks.stopped.mockResolvedValue({ settled: 0, waiting: 0, late: 0 });
  vi.stubEnv("METERING_SHADOW", "off");
});
it("expires one bounded authoritative page regardless of the retired shadow flag", async () => {
  mocks.expire.mockResolvedValue({ outcome: "expired", count: 100, hasMore: true });
  mocks.expire.mockResolvedValueOnce({ outcome: "expired", count: 100, hasMore: true });
  mocks.expire.mockResolvedValueOnce({ outcome: "expired", count: 2, hasMore: false });
  await expect(maintainMeteringReservations()).resolves.toEqual({ count: 102, hasMore: true });
  expect(mocks.expire).toHaveBeenCalledWith({ namespace: "test", limit: 100 });
});

it("also expires the assistant namespace and releases its never-sent attempt rows", async () => {
  mocks.expire.mockResolvedValue({ outcome: "expired", count: 0, hasMore: false });
  await maintainMeteringReservations();
  expect(mocks.expire).toHaveBeenCalledWith({ namespace: "assistant", limit: 100 });
  expect(mocks.stale).toHaveBeenCalledOnce();
  // Stopped answers are charged by this one-minute sweep within their settlement window.
  expect(mocks.stopped).toHaveBeenCalledOnce();
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
