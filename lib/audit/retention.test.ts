import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuditRetentionDays, purgeAuditLogs } from "./retention";

const mocks = vi.hoisted(() => ({
  prisma: {
    auditLog: { deleteMany: vi.fn() },
  },
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mocks.prisma,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));

describe("purgeAuditLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUDIT_RETENTION_DAYS = "";
    mocks.prisma.auditLog.deleteMany.mockResolvedValue({ count: 3 });
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
  });

  it("deletes only audit rows older than the retention cutoff", async () => {
    const now = new Date("2026-06-20T00:00:00.000Z");
    const summary = await purgeAuditLogs({ now, retentionDays: 30 });

    expect(mocks.prisma.auditLog.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date("2026-05-21T00:00:00.000Z") } },
    });
    expect(summary).toEqual({
      cutoff: new Date("2026-05-21T00:00:00.000Z"),
      deleted: 3,
      retentionDays: 30,
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "audit_log.purge",
        actorId: null,
        after: {
          cutoff: "2026-05-21T00:00:00.000Z",
          deletedCount: 3,
          retentionDays: 30,
        },
        projectId: null,
        targetId: "audit_log",
        targetType: "system",
      }),
    );
  });

  it("uses AUDIT_RETENTION_DAYS with a 365-day default", async () => {
    expect(getAuditRetentionDays()).toBe(365);
    await purgeAuditLogs({ now: new Date("2026-06-20T00:00:00.000Z") });
    process.env.AUDIT_RETENTION_DAYS = "120";
    expect(getAuditRetentionDays()).toBe(120);
    const summary = await purgeAuditLogs({ now: new Date("2026-06-20T00:00:00.000Z") });

    expect(summary.retentionDays).toBe(120);
    expect(mocks.prisma.auditLog.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { createdAt: { lt: new Date("2025-06-20T00:00:00.000Z") } },
    });
    expect(mocks.prisma.auditLog.deleteMany).toHaveBeenNthCalledWith(2, {
      where: { createdAt: { lt: new Date("2026-02-20T00:00:00.000Z") } },
    });
  });
});
