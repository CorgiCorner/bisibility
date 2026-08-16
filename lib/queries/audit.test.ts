import { writeAudit } from "@/lib/auth/audit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuditLogView } from "./audit";
import { diffFor } from "./audit-diff";

const mocks = vi.hoisted(() => ({
  prisma: {
    auditLog: { findFirst: vi.fn(), findMany: vi.fn() },
    project: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  requireSession: vi.fn(),
  writeAudit: vi.fn(),
  writeAuditFailure: vi.fn(),
}));

vi.mock("@/lib/auth/audit", () => ({
  writeAudit: mocks.writeAudit,
  writeAuditFailure: mocks.writeAuditFailure,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: mocks.requireSession,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mocks.prisma,
}));

const project = {
  domain: "example.com",
  id: "project_1",
  name: "Example",
  publicId: "prj_abcdefghijklmnopqrstuvwx",
};
const RAW_CUID = "clx0123456789abcdefghijklm";

function auditRow() {
  return {
    action: "provider.test",
    appVersion: "1.2.3",
    actor: {
      email: "auditor@example.com",
      id: "user_1",
      name: "Auditor User",
      publicId: "usr_abcdefghijklmnopqrstuvwx",
    },
    after: { provider: "dataforseo" },
    before: null,
    correlationId: "corr_1",
    createdAt: new Date("2026-01-10T12:00:00.000Z"),
    publicId: "audit_abcdefghijklmnopqrstuvwx",
    sourceIpMasked: "203.0.113.0",
    status: "failed",
    statusReason: "provider unavailable",
    targetId: "conn_abcdefghijklmnopqrstuvwx",
    targetType: "provider_connection",
    userAgent: "Vitest",
  };
}

describe("getAuditLogView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      memberships: [{ projectId: "project_1", role: "auditor" }],
      role: "viewer",
    });
    mocks.prisma.project.findFirst.mockResolvedValue(project);
    mocks.prisma.auditLog.findFirst.mockResolvedValue(null);
    mocks.prisma.auditLog.findMany.mockResolvedValue([auditRow()]);
    mocks.writeAudit.mockResolvedValue({ id: "audit_view_1" });
    process.env.AUDIT_RETENTION_DAYS = "";
  });

  it("allows auditors to read audit entries and surfaces recorded metadata", async () => {
    const result = await getAuditLogView(project.publicId);

    expect(result.authorized).toBe(true);
    if (!result.authorized) {
      throw new Error("expected authorized audit view");
    }
    expect(result.entries[0]).toMatchObject({
      metadata: { app_version: "1.2.3", correlation_id: "[redacted]", user_agent: "Vitest" },
      source: { ip: "203.0.113.0" },
      status: "failed",
      statusReason: "provider unavailable",
      timestampLabel: "2026-01-10 12:00:00 UTC",
    });
  });

  it("redacts raw IDs from nested audit values and unaddressable resources", async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue([
      {
        ...auditRow(),
        after: { nested: { previousAdministratorIds: [RAW_CUID, 42] } },
        before: { legacyId: RAW_CUID },
        correlationId: RAW_CUID,
        targetId: RAW_CUID,
      },
    ]);

    const result = await getAuditLogView(project.publicId);
    if (!result.authorized) throw new Error("expected authorized audit view");

    expect(result.entries[0]?.resource).toMatchObject({ id: null, name: "Resource unavailable" });
    expect(JSON.stringify(result.entries[0])).not.toContain(RAW_CUID);
  });

  it("formats timestamp labels with sortable UTC date parts and seconds", async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue([
      { ...auditRow(), createdAt: new Date("2026-06-19T14:42:08.987Z") },
    ]);

    const result = await getAuditLogView(project.publicId);

    expect(result.authorized).toBe(true);
    if (!result.authorized) {
      throw new Error("expected authorized audit view");
    }
    expect(result.entries[0]?.timestampLabel).toBe("2026-06-19 14:42:08 UTC");
    expect(result.entries[0]?.timestamp).toBe("2026-06-19T14:42:08.987Z");
  });

  it("logs repeated authorized audit-log views once per debounce window", async () => {
    mocks.prisma.auditLog.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "audit_view_1" });

    await getAuditLogView(project.publicId);
    await getAuditLogView(project.publicId);

    expect(writeAudit).toHaveBeenCalledTimes(1);
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "audit_log.view",
        actorId: "user_1",
        projectId: "project_1",
        targetId: project.publicId,
        targetType: "project",
      }),
    );
    expect(mocks.prisma.auditLog.findFirst).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.auditLog.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: expect.objectContaining({
        action: "audit_log.view",
        actorId: "user_1",
        createdAt: { gte: expect.any(Date) },
        projectId: "project_1",
        targetId: project.publicId,
      }),
    });
  });

  it("declares and applies the cap used by client-side audit filters", async () => {
    const result = await getAuditLogView(project.publicId, { dateRange: "90d" });

    expect(result.authorized).toBe(true);
    if (!result.authorized) {
      throw new Error("expected authorized audit view");
    }
    expect(result.entryLimit).toBe(200);
    expect(mocks.prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: result.entryLimit + 1 }),
    );
  });

  it("always scopes user-facing audit rows to the resolved project", async () => {
    await getAuditLogView(project.publicId, { dateRange: "all" });

    expect(mocks.prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "project_1" },
      }),
    );
    expect(mocks.prisma.auditLog.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: null }),
      }),
    );
  });

  it("returns the newest 200 entries and marks larger result sets as truncated", async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue(Array.from({ length: 201 }, () => auditRow()));

    const result = await getAuditLogView(project.publicId);

    expect(result.authorized).toBe(true);
    if (!result.authorized) {
      throw new Error("expected authorized audit view");
    }
    expect(result.entries).toHaveLength(200);
    expect(result.truncated).toBe(true);
    expect(result.retentionDays).toBe(365);
  });

  it("derives a gravatar URL for a real actor", async () => {
    const result = await getAuditLogView(project.publicId);
    if (!result.authorized) throw new Error("expected authorized audit view");

    expect(result.entries[0]?.actor.avatarUrl).toEqual(
      expect.stringContaining("https://www.gravatar.com/avatar/"),
    );
  });

  it("sets avatarUrl to null for a synthetic system actor", async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue([{ ...auditRow(), actor: null }]);

    const result = await getAuditLogView(project.publicId);
    if (!result.authorized) throw new Error("expected authorized audit view");

    expect(result.entries[0]?.actor.avatarUrl).toBeNull();
    expect(result.entries[0]?.actor.name).toBe("System");
  });
});

describe("diffFor", () => {
  it("filters unchanged fields", () => {
    expect(diffFor({ id: "key_1", name: "Production" }, { id: "key_1", name: "Renamed" })).toEqual([
      { after: "Renamed", before: "Production", field: "name" },
    ]);
  });

  it("renders bulk-delete arrays as one readable item list", () => {
    expect(
      diffFor(
        [
          { id: "keyword_1", publicId: "kw_abcdefghijklmnopqrstuvwx", text: "best corgi food" },
          { id: "keyword_2", publicId: "kw_bbcdefghijklmnopqrstuvwx", text: "corgi harness" },
        ],
        null,
      ),
    ).toEqual([
      {
        after: null,
        before: "best corgi food\ncorgi harness",
        field: "items",
      },
    ]);
  });

  it("pretty-prints nested object values", () => {
    expect(
      diffFor({ schedule: { frequency: "daily" } }, { schedule: { frequency: "weekly" } }),
    ).toEqual([
      {
        after: '{\n  "frequency": "weekly"\n}',
        before: '{\n  "frequency": "daily"\n}',
        field: "schedule",
      },
    ]);
  });

  it("returns no diff when both snapshots are null", () => {
    expect(diffFor(null, null)).toEqual([]);
  });

  it("returns only populated after values for creates", () => {
    expect(diffFor(null, { id: "key_1", name: "Production" })).toEqual([
      { after: "key_1", before: null, field: "id" },
      { after: "Production", before: null, field: "name" },
    ]);
  });

  it("returns only populated before values for deletes", () => {
    expect(diffFor({ id: "key_1", name: "Production" }, null)).toEqual([
      { after: null, before: "key_1", field: "id" },
      { after: null, before: "Production", field: "name" },
    ]);
  });
});
