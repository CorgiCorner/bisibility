import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), audit: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/auth/instance-admin", () => ({ requireInstanceAdmin: mocks.session }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("./read", () => ({ readRecoveryPage: mocks.read }));

import { getRecoveryLanding, getRecoveryPage } from "./service";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "actor" } });
  mocks.read.mockResolvedValue({ rows: [] });
});
it("retains the view audit and forwards a frozen time to the existing reader", async () => {
  const now = new Date("2026-11-05T12:00:00Z");
  await expect(getRecoveryPage({ category: "unfinished" }, now)).resolves.toEqual({ rows: [] });
  expect(mocks.audit).toHaveBeenCalledWith({
    action: "instance_admin.metering_recovery_viewed",
    actorId: "actor",
    targetType: "instance_ops",
    targetId: "metering-recovery",
    after: { category: "unfinished" },
  });
  expect(mocks.read).toHaveBeenCalledWith("actor", { category: "unfinished" }, now);
  expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.read.mock.invocationCallOrder[0],
  );
});
it("does not read without authorization or a successful audit", async () => {
  mocks.session.mockRejectedValueOnce(new Error("forbidden"));
  await expect(getRecoveryPage({})).rejects.toThrow("forbidden");
  expect(mocks.read).not.toHaveBeenCalled();
  mocks.audit.mockRejectedValueOnce(new Error("audit unavailable"));
  await expect(getRecoveryPage({})).rejects.toThrow("audit unavailable");
  expect(mocks.read).not.toHaveBeenCalled();
});
it("retains the existing landing fallback for unavailable recovery", async () => {
  mocks.read.mockRejectedValue(new Error("database unavailable"));
  expect(await getRecoveryLanding()).toBeNull();
});
it("validates filters before audit or database work", async () => {
  await expect(getRecoveryPage({ provider: "invalid provider" })).rejects.toThrow();
  expect(mocks.audit).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
});
