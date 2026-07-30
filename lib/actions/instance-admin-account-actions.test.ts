import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetInstanceAdminAccountLimits,
  setInstanceAdminAccountDeactivated,
} from "./instance-admin-account-actions";

const USER_PUBLIC_ID = "usr_abcdefghijklmnopqrstuvwx";
const ADMIN_PUBLIC_ID = "usr_zyxwvutsrqponmlkjihgfedc";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  getInstanceAdminSession: vi.fn(),
  resetBucketsFor: vi.fn(),
  tx: {
    session: { deleteMany: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/api/ratelimit", () => ({
  consume: mocks.consume,
  resetBucketsFor: mocks.resetBucketsFor,
}));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/auth/instance-admin", () => ({
  getInstanceAdminSession: mocks.getInstanceAdminSession,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (work: (tx: typeof mocks.tx) => unknown) => work(mocks.tx),
    user: mocks.tx.user,
  },
}));

describe("instance admin account actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getInstanceAdminSession.mockResolvedValue({ user: { id: "admin_1" } });
    mocks.consume.mockResolvedValue({ limit: 5, remaining: 4, resetAt: Date.now(), success: true });
    mocks.tx.user.findUnique.mockResolvedValue({
      deactivatedAt: null,
      id: "user_1",
      isInstanceAdmin: false,
      publicId: USER_PUBLIC_ID,
    });
    mocks.tx.user.update.mockResolvedValue({ id: "user_1" });
    mocks.tx.session.deleteMany.mockResolvedValue({ count: 2 });
    mocks.resetBucketsFor.mockResolvedValue({ backend: "redis", deleted: 3 });
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
  });

  it("deactivates a non-admin, revokes every session, and audits outside projects", async () => {
    const result = await setInstanceAdminAccountDeactivated({
      deactivated: true,
      userId: USER_PUBLIC_ID,
    });

    expect(result).toMatchObject({ accountStatus: "deactivated", status: "completed" });
    expect(mocks.tx.user.update).toHaveBeenCalledWith({
      data: { deactivatedAt: expect.any(Date) },
      where: { id: "user_1" },
    });
    expect(mocks.tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "user_1" } });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "instance_admin.account_deactivated",
        actorId: "admin_1",
        projectId: null,
        targetId: USER_PUBLIC_ID,
      }),
      mocks.tx,
    );
  });

  it("blocks every instance-admin target, including self, without mutation", async () => {
    mocks.tx.user.findUnique.mockResolvedValueOnce({
      deactivatedAt: null,
      id: "admin_1",
      isInstanceAdmin: true,
      publicId: ADMIN_PUBLIC_ID,
    });

    await expect(
      setInstanceAdminAccountDeactivated({ deactivated: true, userId: ADMIN_PUBLIC_ID }),
    ).resolves.toEqual({
      message: "Instance administrators cannot be deactivated.",
      status: "blocked",
    });
    expect(mocks.tx.user.update).not.toHaveBeenCalled();
    expect(mocks.tx.session.deleteMany).not.toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "instance_admin.account_deactivate_blocked",
        projectId: null,
        status: "failed",
        targetId: ADMIN_PUBLIC_ID,
      }),
      mocks.tx,
    );
  });

  it("reactivates by clearing the flag and documents schedule reconvergence", async () => {
    mocks.tx.user.findUnique.mockResolvedValueOnce({
      deactivatedAt: new Date("2026-07-18T00:00:00.000Z"),
      id: "user_1",
      isInstanceAdmin: false,
      publicId: USER_PUBLIC_ID,
    });

    const result = await setInstanceAdminAccountDeactivated({
      deactivated: false,
      userId: USER_PUBLIC_ID,
    });

    expect(result).toMatchObject({
      accountStatus: "active",
      message: expect.stringContaining("reconverge"),
      status: "completed",
    });
    expect(mocks.tx.user.update).toHaveBeenCalledWith({
      data: { deactivatedAt: null },
      where: { id: "user_1" },
    });
    expect(mocks.tx.session.deleteMany).not.toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "instance_admin.account_reactivated", projectId: null }),
      mocks.tx,
    );
  });

  it("resets rate-limit buckets without claiming to reset rolling spend", async () => {
    const result = await resetInstanceAdminAccountLimits({ userId: USER_PUBLIC_ID });

    expect(mocks.resetBucketsFor).toHaveBeenCalledWith("user_1");
    expect(result).toEqual({
      clearedBuckets: 3,
      message: "Rate limits reset; monthly spend is a rolling window and cannot be reset",
      status: "completed",
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "instance_admin.account_limits_reset",
        after: { budgetReset: false, clearedBuckets: 3 },
        projectId: null,
        targetId: USER_PUBLIC_ID,
      }),
    );
  });

  it("gates and rate-limits both actions", async () => {
    mocks.getInstanceAdminSession.mockResolvedValueOnce(null);
    await expect(
      resetInstanceAdminAccountLimits({ userId: USER_PUBLIC_ID }),
    ).resolves.toMatchObject({
      status: "forbidden",
    });
    expect(mocks.resetBucketsFor).not.toHaveBeenCalled();

    mocks.getInstanceAdminSession.mockResolvedValueOnce({ user: { id: "admin_1" } });
    mocks.consume.mockResolvedValueOnce({
      limit: 5,
      remaining: 0,
      resetAt: Date.parse("2026-07-18T01:00:00.000Z"),
      success: false,
    });
    await expect(
      setInstanceAdminAccountDeactivated({ deactivated: true, userId: USER_PUBLIC_ID }),
    ).resolves.toMatchObject({ status: "rate_limited" });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: null, status: "failed" }),
    );
  });
});
