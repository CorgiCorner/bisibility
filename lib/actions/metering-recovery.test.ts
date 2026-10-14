import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), limit: vi.fn(), commit: vi.fn() }));
vi.mock("@/lib/auth/instance-admin", () => ({ getInstanceAdminSession: mocks.session }));
vi.mock("@/lib/api/ratelimit", () => ({ consume: mocks.limit }));
vi.mock("@/lib/metering/recovery/commands", () => ({
  commitRecovery: mocks.commit,
  getRecoveryCommand: vi.fn(),
}));
vi.mock("@/lib/metering/recovery/service", () => ({ getRecoveryPage: vi.fn() }));
vi.mock("@/lib/metering/recovery/preview", () => ({ previewRecovery: vi.fn() }));
vi.mock("@/lib/metering/recovery/triage", () => ({ updateRecoveryTriage: vi.fn() }));

import { commitRecoveryAction } from "./metering-recovery";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "admin" } });
  mocks.limit.mockResolvedValue({ success: true });
});
it("rejects missing administrator access before a command or rate-limit write", async () => {
  mocks.session.mockResolvedValue(null);
  expect(await commitRecoveryAction({})).toEqual({ ok: false, code: "forbidden" });
  expect(mocks.commit).not.toHaveBeenCalled();
  expect(mocks.limit).not.toHaveBeenCalled();
});
it("fails closed when the action limiter is unavailable", async () => {
  mocks.limit.mockRejectedValue(new Error("private limiter error"));
  expect(await commitRecoveryAction({})).toEqual({ ok: false, code: "unavailable" });
  expect(mocks.commit).not.toHaveBeenCalled();
});
it("bounds writes and returns a closed error instead of provider or database exception text", async () => {
  mocks.commit.mockRejectedValue(new Error("Authorization bearer private-account"));
  expect(await commitRecoveryAction({})).toEqual({ ok: false, code: "unavailable" });
  expect(mocks.limit).toHaveBeenCalledWith(
    expect.objectContaining({ limit: 6, windowSeconds: 60 }),
  );
});
