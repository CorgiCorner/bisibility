import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordedFixture } from "@/lib/rank-measurements/recorded-fixtures";
import type { MeasurementScope } from "@/lib/rank-measurements/types";
import type { RetainedReportCheck } from "@/lib/rank-reports/model";
import { sendWeeklyDigestForProject } from "./weekly-digest-send";

const mocks = vi.hoisted(() => ({
  candidates: vi.fn(),
  metadata: vi.fn(),
  retained: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
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

// Keep the collector and shared quality resolver real; only the SQL read boundary is synthetic.
vi.mock("@/lib/queries/rank-tracker-report-database", () => ({ loadRankTrackerReportCandidates: mocks.candidates }));
vi.mock("@/lib/queries/rank-tracker-metadata-batches", () => ({ loadRankTrackerMetadataBatches: mocks.metadata }));
vi.mock("@/lib/rank-reports/database", () => ({ loadRetainedRankReportTargets: mocks.retained }));

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
  return { domain: "example.com", id: "project_1", publicId: "prj_abcdefghijklmnopqrstuvwx", name: "Example" };
}

const targetId = "kw_abcdefghijklmnopqrstuvwx";
const scope: MeasurementScope = { projectId: "project_1", targetId, targetRevision: "target-revision-1", policyRevision: "policy-revision-1",
  engine: "google", surface: "web_serp", resultKind: "organic_result", rankScale: "organic_group", location: "US", language: "en", device: "desktop" };
function windowCheck(id: string, at: Date, position: number | null, overrides: Partial<RetainedReportCheck> = {}): RetainedReportCheck {
  const check = recordedFixture(position, { id, targetId, observedAt: at, recordedAt: at, requestedAt: new Date(at.getTime() - 1000), configuredScope: scope, effectiveScope: scope });
  return { ...check, createdAt: at, updatedAt: at, attemptCount: 1, deferredReason: null, errorCode: null,
    expectedUrlAtCheck: null, startedAt: at, finishedAt: at, observationRun: { ...check.observationRun, items: [] }, ...overrides };
}
function digestTarget() {
  return { id: targetId, expectedScope: scope, volume: 1, freshForMs: 3 * 86_400_000,
    baselineWindow: { before: new Date("2026-06-27T11:59:59.999Z"), notBefore: new Date("2026-06-24T11:59:59.999Z") },
    checks: [windowCheck("current", new Date("2026-07-03T12:00:00Z"), 3),
      windowCheck("failed", new Date("2026-07-01T12:00:00Z"), null, { status: "failed" }),
      windowCheck("baseline", new Date("2026-06-27T11:00:00Z"), 8)] };
}
function mockDigestData() {
  mocks.prisma.project.findFirst.mockResolvedValueOnce(accessProject()).mockResolvedValueOnce(dataProject());
  mocks.prisma.auditLog.findFirst.mockResolvedValue(null);
  mocks.candidates.mockResolvedValue({ rows: [{ id: "keyword_1", publicId: targetId, text: "keyword one", createdAt: new Date("2026-06-01T00:00:00Z") }] });
  mocks.metadata.mockResolvedValue(new Map([[targetId, { expectedScope: scope, freshForMs: 3 * 86_400_000, volume: 1 }]]));
  mocks.retained.mockResolvedValue([digestTarget()]);
}

describe("sendWeeklyDigestForProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation((run) => run(mocks.prisma));
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
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead" });
    expect(mocks.metadata.mock.calls[0][4]).toEqual(new Date(now.getTime() - 1));
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
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.candidates).not.toHaveBeenCalled();
    expect(mocks.metadata).not.toHaveBeenCalled();
    expect(mocks.retained).not.toHaveBeenCalled();
    expect(mocks.prisma.rankCheck.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
  it("does not email or audit when the selected week has no activity", async () => {
    mockDigestData(); mocks.retained.mockResolvedValue([{ ...digestTarget(), checks: [] }]);
    await expect(sendWeeklyDigestForProject("project_1", now)).resolves.toEqual({ status: "skipped", reason: "no_activity" });
    expect(mocks.sendEmail).not.toHaveBeenCalled(); expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("does not read measurement data or send when no recipient opted in", async () => {
    const access = accessProject(); access.owner.emailVerified = false;
    access.members.forEach(({ user }) => { user.emailVerified = false; });
    mocks.prisma.project.findFirst.mockResolvedValueOnce(access);
    mocks.prisma.auditLog.findFirst.mockResolvedValue(null);
    await expect(sendWeeklyDigestForProject("project_1", now)).resolves.toEqual({ status: "skipped", reason: "no_recipients" });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled(); expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("never reports a future observed instant as comparable current movement", async () => {
    mockDigestData(); const target = digestTarget();
    const original = target.checks[0].observationRun;
    if (!original) throw new Error("Synthetic observation is required.");
    target.checks[0] = { ...target.checks[0], observationRun: { ...original, requestPolicy: { evidence: {
      version: 1, targetRevision: scope.targetRevision, policyRevision: scope.policyRevision,
      observedAt: new Date(now.getTime() + 1).toISOString(), completeThrough: { organic_result: 100 },
    } } } };
    mocks.retained.mockResolvedValue([target]);
    await expect(sendWeeklyDigestForProject("project_1", now)).resolves.toMatchObject({ status: "sent", topMovers: 0 });
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("Average delta: No comparable history"),
    }));
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("Unknown: 1") }));
  });

});
