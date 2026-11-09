import { AdminTwoFactorRequiredError } from "@/lib/auth/admin-dangerous-action";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  limit: vi.fn(),
  commit: vi.fn(),
  preview: vi.fn(),
  triage: vi.fn(),
  command: vi.fn(),
  page: vi.fn(),
}));
vi.mock("@/lib/auth/instance-admin", () => ({ getInstanceAdminSession: mocks.session }));
vi.mock("@/lib/api/ratelimit", () => ({ consume: mocks.limit }));
vi.mock("@/lib/metering/recovery/commands", () => ({
  commitRecovery: mocks.commit,
  getRecoveryCommand: mocks.command,
}));
vi.mock("@/lib/metering/recovery/service", () => ({ getRecoveryPage: mocks.page }));
vi.mock("@/lib/metering/recovery/preview", () => ({ previewRecovery: mocks.preview }));
vi.mock("@/lib/metering/recovery/triage", () => ({ updateRecoveryTriage: mocks.triage }));

import {
  commitRecoveryAction,
  getRecoveryCommandAction,
  loadRecoveryPageAction,
  previewRecoveryAction,
  updateRecoveryTriageAction,
} from "./metering-recovery";

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

const dangerousActionGuard = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/auth/admin-dangerous-action", async (original) => ({
  ...(await original<typeof import("@/lib/auth/admin-dangerous-action")>()),
  requireAdminTwoFactorForDangerousAction: dangerousActionGuard,
}));

it("refuses the dangerous operation when the admin has no enabled 2FA", async () => {
  dangerousActionGuard.mockRejectedValueOnce(new AdminTwoFactorRequiredError("test_action"));
  expect(await commitRecoveryAction({})).toMatchObject({ ok: false, code: "two_factor_required" });
});

it.each([
  commitRecoveryAction,
  previewRecoveryAction,
  updateRecoveryTriageAction,
  getRecoveryCommandAction,
  loadRecoveryPageAction,
])("denies absent and non-admin sessions before recovery service calls", async (run) => {
  for (const state of ["unauthenticated", "non-admin"]) {
    mocks.session.mockResolvedValue(null);
    expect(await run("fixture")).toEqual({ ok: false, code: "forbidden" });
    for (const service of [
      mocks.commit,
      mocks.preview,
      mocks.triage,
      mocks.command,
      mocks.page,
      mocks.limit,
    ])
      expect(service, state).not.toHaveBeenCalled();
  }
});
