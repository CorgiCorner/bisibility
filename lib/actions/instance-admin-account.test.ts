import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lookupInstanceAdminAccount } from "./instance-admin-account";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  getInstanceAdminSession: vi.fn(),
  prisma: {
    keyword: { count: vi.fn() },
    notification: { create: vi.fn(), createMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    providerConnection: { groupBy: vi.fn() },
    rankCheck: { aggregate: vi.fn() },
    user: { findFirst: vi.fn() },
  },
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/api/ratelimit", () => ({ consume: mocks.consume }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/auth/instance-admin", () => ({
  getInstanceAdminSession: mocks.getInstanceAdminSession,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const account = {
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
  deactivatedAt: null,
  email: "Member@Example.com",
  id: "user_1",
  memberships: [{ projectId: "project_1" }, { projectId: "project_2" }],
  projects: [{ id: "project_1" }],
  publicId: "usr_abcdefghijklmnopqrstuvwx",
  sessions: [{ updatedAt: new Date("2026-07-17T12:00:00.000Z") }],
};

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

describe("lookupInstanceAdminAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.getInstanceAdminSession.mockResolvedValue({ user: { id: "admin_1" } });
    mocks.consume.mockResolvedValue({
      limit: 10,
      remaining: 9,
      resetAt: Date.parse("2026-07-18T00:01:00.000Z"),
      success: true,
    });
    mocks.prisma.user.findFirst.mockResolvedValue(account);
    mocks.prisma.keyword.count.mockResolvedValue(7);
    mocks.prisma.providerConnection.groupBy.mockResolvedValue([
      { _count: { _all: 2 }, kind: "rank" },
      { _count: { _all: 1 }, kind: "traffic" },
    ]);
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({
      _sum: { costCents: "12.2500", estimatedCostCents: "0.7500" },
    });
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
  });

  it("looks up an exact case-insensitive email and returns content-free metadata", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T00:00:00.000Z"));

    await expect(
      lookupInstanceAdminAccount({ identifier: "  MEMBER@EXAMPLE.COM " }),
    ).resolves.toEqual({
      account: {
        createdAt: "2026-01-02T03:04:05.000Z",
        email: "Member@Example.com",
        id: "usr_abcdefghijklmnopqrstuvwx",
        keywordCount: 7,
        lastActiveAt: "2026-07-17T12:00:00.000Z",
        monthlySpendCents: 13,
        projectCount: 2,
        providerConnectionsByKind: [
          { count: 2, kind: "rank" },
          { count: 1, kind: "traffic" },
        ],
        status: "active",
      },
      status: "found",
    });
    expect(mocks.prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: "member@example.com", mode: "insensitive" } },
      }),
    );
    expect(mocks.prisma.rankCheck.aggregate).toHaveBeenCalledWith({
      _sum: { costCents: true, estimatedCostCents: true },
      where: {
        checkedAt: {
          gte: new Date("2026-07-01T00:00:00.000Z"),
          lt: new Date("2026-08-01T00:00:00.000Z"),
        },
        keyword: { projectId: { in: ["project_1", "project_2"] } },
        status: { not: "deferred" },
      },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "instance_admin.account_viewed",
        actorId: "admin_1",
        projectId: null,
        targetId: "usr_abcdefghijklmnopqrstuvwx",
      }),
    );
  });

  it("uses exact public user IDs without a partial or fuzzy condition", async () => {
    await lookupInstanceAdminAccount({ identifier: " usr_abcdefghijklmnopqrstuvwx " });

    expect(mocks.prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicId: "usr_abcdefghijklmnopqrstuvwx" } }),
    );
  });

  it("reports deactivated state without exposing additional account content", async () => {
    mocks.prisma.user.findFirst.mockResolvedValueOnce({
      ...account,
      deactivatedAt: new Date("2026-07-17T00:00:00.000Z"),
    });

    const result = await lookupInstanceAdminAccount({
      identifier: "usr_abcdefghijklmnopqrstuvwx",
    });

    expect(result).toMatchObject({
      account: { id: "usr_abcdefghijklmnopqrstuvwx", status: "deactivated" },
    });
  });

  it("audits misses with only the normalized identifier hash", async () => {
    mocks.prisma.user.findFirst.mockResolvedValueOnce(null);

    await expect(
      lookupInstanceAdminAccount({ identifier: " MISSING@EXAMPLE.COM " }),
    ).resolves.toEqual({
      message: "No account matched that exact identifier.",
      status: "not_found",
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith({
      action: "instance_admin.account_viewed",
      actorId: "admin_1",
      after: { result: "not_found" },
      projectId: null,
      status: "failed",
      statusReason: "Account not found.",
      targetId: sha256("missing@example.com"),
      targetType: "instance_ops",
    });
    expect(mocks.prisma.keyword.count).not.toHaveBeenCalled();
  });

  it("rate limits per admin and audits the rejected identifier hash", async () => {
    mocks.consume.mockResolvedValueOnce({
      limit: 10,
      remaining: 0,
      resetAt: Date.parse("2026-07-18T00:01:00.000Z"),
      success: false,
    });

    await expect(
      lookupInstanceAdminAccount({ identifier: "usr_abcdefghijklmnopqrstuvwx" }),
    ).resolves.toEqual({
      message: "Too many account lookups. Try again shortly.",
      retryAt: "2026-07-18T00:01:00.000Z",
      status: "rate_limited",
    });
    expect(mocks.consume).toHaveBeenCalledWith({
      bucketKey: "admin_1",
      limit: 10,
      prefix: "bisibility:instance-admin:account-lookup",
      windowSeconds: 60,
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: null,
        status: "failed",
        targetId: sha256("usr_abcdefghijklmnopqrstuvwx"),
        targetType: "instance_ops",
      }),
    );
    expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("fails closed and audits when the limiter is unavailable", async () => {
    mocks.consume.mockRejectedValueOnce(new Error("redis unavailable"));

    await expect(
      lookupInstanceAdminAccount({ identifier: "usr_abcdefghijklmnopqrstuvwx" }),
    ).resolves.toEqual({
      message: "Account lookup is temporarily unavailable.",
      status: "failed",
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: { result: "failed" },
        projectId: null,
        status: "failed",
        targetId: sha256("usr_abcdefghijklmnopqrstuvwx"),
        targetType: "instance_ops",
      }),
    );
    expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("rejects non-admin callers before lookup, audit, or rate limiting", async () => {
    mocks.getInstanceAdminSession.mockResolvedValueOnce(null);

    await expect(lookupInstanceAdminAccount({ identifier: "user_1" })).resolves.toEqual({
      message: "This action is not available.",
      status: "forbidden",
    });
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("rejects invalid server input without database work or identifier disclosure", async () => {
    const rawIdentifier = "private@example.com".repeat(30);

    const result = await lookupInstanceAdminAccount({ identifier: rawIdentifier });

    expect(result).toEqual({
      message: "Enter an exact email address or user ID.",
      status: "failed",
    });
    expect(JSON.stringify(result)).not.toContain(rawIdentifier);
    expect(mocks.getInstanceAdminSession).toHaveBeenCalledOnce();
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("never creates or updates user notifications for hits or misses", async () => {
    await lookupInstanceAdminAccount({ identifier: "usr_abcdefghijklmnopqrstuvwx" });
    mocks.prisma.user.findFirst.mockResolvedValueOnce(null);
    await lookupInstanceAdminAccount({ identifier: "missing@example.com" });

    expect(mocks.prisma.notification.create).not.toHaveBeenCalled();
    expect(mocks.prisma.notification.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.notification.update).not.toHaveBeenCalled();
    expect(mocks.prisma.notification.updateMany).not.toHaveBeenCalled();
  });
});
