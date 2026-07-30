import { beforeEach, describe, expect, it, vi } from "vitest";
import { markProjectAlertsRead, muteTriggeredAlert } from "./feed-mutations";

const alertPublicId = "al_aaaaaaaaaaaaaaaaaaaaaaaa";
const projectPublicId = "prj_aaaaaaaaaaaaaaaaaaaaaaaa";

const mocks = vi.hoisted(() => ({
  prisma: {
    project: { findFirst: vi.fn() },
    triggeredAlert: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
  writeAudit: vi.fn(),
  writeAuditFailure: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({
  writeAudit: mocks.writeAudit,
  writeAuditFailure: mocks.writeAuditFailure,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const actor = { id: "user_1", memberships: [{ projectId: "project_1", role: "admin" as const }] };

describe("triggered alert mutation core", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writeAuditFailure.mockResolvedValue(undefined);
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      publicId: projectPublicId,
      writeMode: "active",
    });
    mocks.prisma.triggeredAlert.updateMany.mockResolvedValue({ count: 3 });
    mocks.prisma.triggeredAlert.findFirst.mockResolvedValue({
      id: "alert_db_1",
      publicId: alertPublicId,
      snoozedUntil: null,
      status: "firing",
    });
    mocks.prisma.triggeredAlert.update.mockResolvedValue({
      id: "alert_db_1",
      publicId: alertPublicId,
      snoozedUntil: new Date("2026-07-23T10:00:00.000Z"),
      status: "firing",
    });
  });

  it("marks every firing project alert read and preserves audit semantics", async () => {
    await expect(markProjectAlertsRead({ actor, projectId: projectPublicId })).resolves.toEqual({
      updated: 3,
    });
    expect(mocks.prisma.triggeredAlert.updateMany).toHaveBeenCalledWith({
      data: { status: "acknowledged" },
      where: { rule: { projectId: "project_1" }, status: "firing" },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "triggered_alert.mark_all_read",
        actorId: "user_1",
        after: { acknowledged: 3 },
        targetId: projectPublicId,
        targetType: "project",
      }),
    );
  });

  it("mutes one scoped alert and supports API-owned audit attribution", async () => {
    await muteTriggeredAlert({
      actor,
      alertId: alertPublicId,
      auditActorId: null,
      projectId: projectPublicId,
    });
    expect(mocks.prisma.triggeredAlert.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { publicId: alertPublicId, rule: { projectId: "project_1" } },
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "triggered_alert.snooze",
        actorId: null,
        targetId: alertPublicId,
      }),
    );
  });

  it("rejects alerts outside the authorized project", async () => {
    mocks.prisma.triggeredAlert.findFirst.mockResolvedValue(null);
    await expect(
      muteTriggeredAlert({
        actor,
        alertId: "al_bbbbbbbbbbbbbbbbbbbbbbbb",
        projectId: projectPublicId,
      }),
    ).rejects.toThrow("Triggered alert not found.");
    expect(mocks.prisma.triggeredAlert.update).not.toHaveBeenCalled();
  });

  it("rejects raw alert primary keys before querying", async () => {
    await expect(
      muteTriggeredAlert({ actor, alertId: "alert_db_1", projectId: projectPublicId }),
    ).rejects.toThrow("Triggered alert not found.");

    expect(mocks.prisma.triggeredAlert.findFirst).not.toHaveBeenCalled();
  });

  it("authorizes the explicit actor without consulting session state", async () => {
    await expect(
      markProjectAlertsRead({
        actor: { id: "outsider", memberships: [] },
        projectId: projectPublicId,
      }),
    ).rejects.toThrow("not authorized");
    expect(mocks.prisma.triggeredAlert.updateMany).not.toHaveBeenCalled();
  });
});
