import { beforeEach, describe, expect, it, vi } from "vitest";
import { archiveSchedule, restoreSchedule } from "./archive";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    checkSchedule: { findFirst: vi.fn(), update: vi.fn() },
    keyword: { findMany: vi.fn(), updateMany: vi.fn() },
    projectDefaults: { upsert: vi.fn() },
  };
  return {
    tx,
    transaction: vi.fn(),
    manual: vi.fn(),
    mirror: vi.fn(),
    reconcile: vi.fn(),
    audit: vi.fn(),
  };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (id: string) => id,
  writeAudit: mocks.audit,
}));
vi.mock("@/lib/rank-check/planner/reconcile-schedule", () => ({
  reconcilePlannedRunsForSchedule: mocks.reconcile,
}));
vi.mock("./service-membership", () => ({
  checkScheduleSelect: {},
  checkScheduleAudit: (s: object) => s,
  mirrorManualToKeywords: mocks.manual,
  mirrorScheduleToKeywords: mocks.mirror,
}));
const schedule = {
  id: "schedule",
  publicId: "sch_current",
  archivedAt: null,
  enabled: true,
  isDefault: true,
};
describe("schedule archive lifecycle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation((fn) => fn(mocks.tx));
    mocks.tx.checkSchedule.findFirst.mockResolvedValue(schedule);
    mocks.tx.keyword.findMany.mockResolvedValue([{ id: "keyword", publicId: "kw_one" }]);
    mocks.tx.checkSchedule.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...schedule, ...data }),
    );
  });
  it("archives the default, moves all members to manual, and keeps the schedule record", async () => {
    await archiveSchedule("actor", "project", {
      scheduleId: "sch_current",
      destinationScheduleId: null,
    });
    expect(mocks.tx.checkSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { archivedAt: expect.any(Date), enabled: false, isDefault: false },
      }),
    );
    expect(mocks.tx.keyword.updateMany).toHaveBeenCalledWith({
      data: { checkScheduleId: null },
      where: { id: { in: ["keyword"] }, projectId: "project" },
    });
    expect(mocks.manual).toHaveBeenCalledWith(mocks.tx, "project", ["keyword"]);
    expect(mocks.tx.projectDefaults.upsert).toHaveBeenCalledWith({
      where: { projectId: "project" },
      create: { projectId: "project", frequency: "manual" },
      update: { frequency: "manual", cronExpression: null, nextCheckAt: null },
    });
    expect(mocks.reconcile).toHaveBeenCalledWith("schedule", mocks.tx, { deleting: true });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "check_schedule.archive",
        before: schedule,
        after: expect.objectContaining({ movedTo: null, keywordIds: ["kw_one"] }),
      }),
      mocks.tx,
    );
  });
  it("moves members to the selected current schedule in the same project", async () => {
    const destination = { ...schedule, id: "destination", publicId: "sch_other", isDefault: false };
    mocks.tx.checkSchedule.findFirst
      .mockResolvedValueOnce(schedule)
      .mockResolvedValueOnce(destination);
    await archiveSchedule("actor", "project", {
      scheduleId: "sch_current",
      destinationScheduleId: "sch_other",
    });
    expect(mocks.tx.checkSchedule.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { archivedAt: null, projectId: "project", publicId: "sch_other" },
      }),
    );
    expect(mocks.mirror).toHaveBeenCalledWith(mocks.tx, "project", destination, ["keyword"]);
    expect(mocks.manual).not.toHaveBeenCalled();
  });
  it("rejects self and missing or foreign destinations before writing", async () => {
    await expect(
      archiveSchedule("actor", "project", {
        scheduleId: "sch_current",
        destinationScheduleId: "sch_current",
      }),
    ).rejects.toThrow();
    mocks.tx.checkSchedule.findFirst.mockResolvedValueOnce(schedule).mockResolvedValueOnce(null);
    await expect(
      archiveSchedule("actor", "project", {
        scheduleId: "sch_current",
        destinationScheduleId: "sch_other",
      }),
    ).rejects.toThrow();
    expect(mocks.tx.checkSchedule.update).not.toHaveBeenCalled();
  });
  it("is idempotent when already archived", async () => {
    mocks.tx.checkSchedule.findFirst.mockResolvedValue({ ...schedule, archivedAt: new Date() });
    await archiveSchedule("actor", "project", {
      scheduleId: "sch_current",
      destinationScheduleId: null,
    });
    expect(mocks.tx.checkSchedule.update).not.toHaveBeenCalled();
  });
  it("restores paused, nondefault and without moving members back", async () => {
    mocks.tx.checkSchedule.findFirst.mockResolvedValue({ ...schedule, archivedAt: new Date() });
    await restoreSchedule("actor", "project", "sch_current");
    expect(mocks.tx.checkSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { archivedAt: null, enabled: false, isDefault: false } }),
    );
    expect(mocks.tx.keyword.updateMany).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "check_schedule.restore" }),
      mocks.tx,
    );
  });
  it("does not pause an already restored schedule on retry", async () => {
    await restoreSchedule("actor", "project", "sch_current");
    expect(mocks.tx.checkSchedule.update).not.toHaveBeenCalled();
  });
});
