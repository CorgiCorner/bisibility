import { notFound } from "@/tests/next-navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getInstanceAdminAuditPage } from "./instance-admin-audit";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  getInstanceAdminSession: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/instance-admin", () => ({
  getInstanceAdminSession: mocks.getInstanceAdminSession,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { auditLog: { findMany: mocks.findMany } },
}));

function auditPublicId(id: string) {
  return `audit_a${id
    .replace(/[^a-z0-9]/gi, "")
    .padEnd(23, "0")
    .slice(0, 23)}`;
}

function auditRow(
  id: string,
  overrides: Partial<{
    action: string;
    actor: { email: string } | null;
    createdAt: Date;
    status: string;
    statusReason: string | null;
    targetId: string;
    targetType: string;
  }> = {},
) {
  return {
    action: "instance_admin.ops_sweep.run",
    actor: { email: "admin@example.com" },
    createdAt: new Date("2026-07-17T20:00:00.000Z"),
    id,
    publicId: auditPublicId(id),
    status: "success",
    statusReason: null,
    targetId: "ops-event-outbox",
    targetType: "instance_ops",
    ...overrides,
  };
}

describe("getInstanceAdminAuditPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mocks.getInstanceAdminSession.mockResolvedValue({ user: { id: "admin_1" } });
    mocks.findMany.mockResolvedValue([]);
  });

  it("gates the operator query before reading audit data", async () => {
    mocks.getInstanceAdminSession.mockResolvedValueOnce(null);

    await expect(getInstanceAdminAuditPage()).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalledOnce();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("selects only display fields and reads one extra deterministic row", async () => {
    await getInstanceAdminAuditPage();

    expect(mocks.findMany).toHaveBeenCalledWith({
      orderBy: [{ createdAt: "desc" }, { publicId: "desc" }],
      select: {
        action: true,
        actor: { select: { email: true } },
        createdAt: true,
        publicId: true,
        status: true,
        statusReason: true,
        targetId: true,
        targetType: true,
      },
      take: 26,
      where: { action: { startsWith: "instance_admin." } },
    });
  });

  it.each([
    ["account", "instance_admin.account_"],
    ["ops", "instance_admin.ops_"],
    ["setup", "instance_admin.first_run_"],
    ["untrusted-prefix", "instance_admin."],
  ])("maps the %s filter to a safe action prefix", async (filter, prefix) => {
    const page = await getInstanceAdminAuditPage({ filter });

    expect(page.filter).toBe(filter === "untrusted-prefix" ? "all" : filter);
    expect(mocks.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { action: { startsWith: prefix } } }),
    );
  });

  it("returns minimal rows and classifies guarded failures as blocked", async () => {
    mocks.findMany.mockResolvedValue([
      auditRow("ok"),
      auditRow("failed", { status: "failed", statusReason: "Delivery failed." }),
      auditRow("blocked-cannot", {
        status: "failed",
        statusReason: "Instance administrators cannot be deactivated.",
      }),
      auditRow("blocked-forbidden", { status: "failed", statusReason: "Forbidden by guard." }),
      auditRow("blocked-transfer", {
        status: "failed",
        statusReason: "Transfer instance administration first - seed another admin.",
      }),
      auditRow("system", { actor: null }),
    ]);

    const page = await getInstanceAdminAuditPage();

    expect(page.entries).toEqual([
      {
        action: "instance_admin.ops_sweep.run",
        actorEmail: "admin@example.com",
        createdAt: "2026-07-17T20:00:00.000Z",
        id: auditPublicId("ok"),
        result: "ok",
        targetId: null,
        targetType: "instance_ops",
      },
      expect.objectContaining({ id: auditPublicId("failed"), result: "failed" }),
      expect.objectContaining({ id: auditPublicId("blocked-cannot"), result: "blocked" }),
      expect.objectContaining({ id: auditPublicId("blocked-forbidden"), result: "blocked" }),
      expect.objectContaining({ id: auditPublicId("blocked-transfer"), result: "blocked" }),
      expect.objectContaining({ actorEmail: null, id: auditPublicId("system") }),
    ]);
    expect(page.entries[1]).not.toHaveProperty("statusReason");
  });

  it("keeps public addressable targets and omits raw or opaque target IDs", async () => {
    mocks.findMany.mockResolvedValue([
      auditRow("public-user", {
        targetId: "usr_abcdefghijklmnopqrstuvwx",
        targetType: "user",
      }),
      auditRow("raw-user", { targetId: "user_1", targetType: "user" }),
      auditRow("opaque-ops"),
    ]);

    const page = await getInstanceAdminAuditPage();

    expect(page.entries.map((entry) => entry.targetId)).toEqual([
      "usr_abcdefghijklmnopqrstuvwx",
      null,
      null,
    ]);
    expect(JSON.stringify(page.entries)).not.toContain("user_1");
    expect(JSON.stringify(page.entries)).not.toContain("ops-event-outbox");
  });

  it("returns an opaque next cursor and applies it as a stable keyset", async () => {
    const rows = Array.from({ length: 26 }, (_, index) =>
      auditRow(`audit_${String(30 - index).padStart(2, "0")}`, {
        createdAt: new Date(`2026-07-17T19:${String(59 - index).padStart(2, "0")}:00.000Z`),
      }),
    );
    mocks.findMany.mockResolvedValueOnce(rows);

    const firstPage = await getInstanceAdminAuditPage({ filter: "ops" });

    expect(firstPage.entries).toHaveLength(25);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    mocks.findMany.mockResolvedValueOnce([]);
    await getInstanceAdminAuditPage({ cursor: firstPage.nextCursor, filter: "ops" });

    const boundary = rows[24];
    expect(mocks.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { action: { startsWith: "instance_admin.ops_" } },
            {
              OR: [
                { createdAt: { lt: boundary.createdAt } },
                { createdAt: boundary.createdAt, publicId: { lt: boundary.publicId } },
              ],
            },
          ],
        },
      }),
    );
  });

  it("rejects malformed and oversized cursors instead of widening the action scope", async () => {
    await expect(
      getInstanceAdminAuditPage({ cursor: "not-a-cursor", filter: "account" }),
    ).rejects.toThrow();
    await expect(
      getInstanceAdminAuditPage({ cursor: "x".repeat(2_049), filter: "account" }),
    ).rejects.toThrow("Audit cursor exceeds the maximum length.");
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
