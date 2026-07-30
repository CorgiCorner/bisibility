import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendWeeklyDigestForProject } from "./weekly-digest-send";

const mocks = vi.hoisted(() => ({
  prisma: {
    auditLog: { findFirst: vi.fn() },
    keyword: { findMany: vi.fn() },
    project: { findFirst: vi.fn() },
    rankCheck: { findMany: vi.fn() },
  },
  sendEmail: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.sendEmail }));

const now = new Date("2026-07-04T12:00:00.000Z");

function user(
  id: string,
  email: string,
  options: { emailVerified?: boolean; reportEmail?: boolean } = {},
) {
  return {
    email,
    emailVerified: options.emailVerified ?? true,
    id,
    notificationPreferences:
      options.reportEmail === undefined ? [] : [{ reportEmail: options.reportEmail }],
  };
}

function accessProject() {
  return {
    id: "project_1",
    members: [
      { user: user("disabled_1", "disabled@example.com", { reportEmail: false }) },
      { user: user("unverified_1", "unverified@example.com", { emailVerified: false }) },
      { user: user("member_1", "member@example.com", { reportEmail: true }) },
      { user: user("owner_1", "owner@example.com") },
    ],
    owner: user("owner_1", "owner@example.com"),
    publicId: "prj_abcdefghijklmnopqrstuvwx",
  };
}

function dataProject() {
  return { domain: "example.com", id: "project_1", name: "Example" };
}

function windowCheck(overrides: Record<string, unknown> = {}) {
  return {
    checkedAt: new Date("2026-07-03T12:00:00.000Z"),
    id: "check_1",
    keyword: { publicId: "kw_one", text: "keyword one" },
    keywordId: "keyword_1",
    position: 3,
    status: "completed",
    ...overrides,
  };
}

function mockDigestData() {
  mocks.prisma.project.findFirst
    .mockResolvedValueOnce(accessProject())
    .mockResolvedValueOnce(dataProject());
  mocks.prisma.auditLog.findFirst.mockResolvedValue(null);
  mocks.prisma.rankCheck.findMany.mockResolvedValueOnce([
    windowCheck(),
    windowCheck({ id: "failed_1", position: null, status: "failed" }),
  ]);
  mocks.prisma.keyword.findMany.mockResolvedValueOnce([
    { id: "keyword_1", rankChecks: [{ position: 8 }] },
  ]);
}

describe("sendWeeklyDigestForProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendEmail.mockResolvedValue(undefined);
    mocks.writeAudit.mockResolvedValue({});
  });

  it("sends only to verified recipients with report email enabled and audits the send", async () => {
    mockDigestData();

    const result = await sendWeeklyDigestForProject("project_1", now);

    expect(result).toEqual({
      failedChecksCount: 1,
      recipients: 2,
      status: "sent",
      topMovers: 1,
    });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "bulk",
        subject: "Weekly rank report - Example",
        to: "owner@example.com",
      }),
    );
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "bulk",
        html: expect.stringContaining("keyword one"),
        to: "member@example.com",
      }),
    );
    expect(mocks.sendEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: "disabled@example.com" }),
    );
    expect(mocks.sendEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: "unverified@example.com" }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith({
      action: "report.weekly_digest_sent",
      actorId: null,
      after: { failedChecksCount: 1, recipients: 2, topMovers: 1 },
      projectId: "project_1",
      targetId: "prj_abcdefghijklmnopqrstuvwx",
      targetType: "project",
    });
  });

  it("skips when a digest was sent in the idempotency window", async () => {
    mocks.prisma.project.findFirst.mockResolvedValueOnce(accessProject());
    mocks.prisma.auditLog.findFirst.mockResolvedValueOnce({ id: "audit_1" });

    const result = await sendWeeklyDigestForProject("project_1", now);

    expect(result).toEqual({ reason: "recently_sent", status: "skipped" });
    expect(mocks.prisma.auditLog.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        action: "report.weekly_digest_sent",
        createdAt: { gte: new Date("2026-06-28T12:00:00.000Z") },
        projectId: "project_1",
        targetType: "project",
      },
    });
    expect(mocks.prisma.rankCheck.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});
