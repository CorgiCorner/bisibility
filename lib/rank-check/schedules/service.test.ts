import { ApiNotFoundError } from "@/lib/api/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSchedule,
  DefaultCheckScheduleDeletionError,
  deleteSchedule,
  setDefaultSchedule,
  updateSchedule,
} from "./service";

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    checkSchedule: {
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    keyword: { findMany: vi.fn(), updateMany: vi.fn() },
    project: { findUnique: vi.fn() },
  };
  return {
    prisma: { $transaction: vi.fn() },
    reconcile: vi.fn(),
    refresh: vi.fn(),
    tx,
    writeAudit: vi.fn(),
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/rank-check/dispatcher-state", () => ({
  refreshKeywordDispatchStates: mocks.refresh,
}));
vi.mock("@/lib/db/public-id", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/public-id")>()),
  makePublicId: () => `sch_${"z".repeat(24)}`,
}));
vi.mock("../planner/reconcile-schedule", () => ({
  reconcilePlannedRunsForSchedule: mocks.reconcile,
}));

const scheduleId = `sch_${"b".repeat(24)}` as `sch_${string}`;
const fallbackId = `sch_${"f".repeat(24)}` as `sch_${string}`;
const keywordId = `kw_${"k".repeat(24)}`;
const schedule = {
  cronExpression: null,
  enabled: true,
  frequency: "daily",
  id: "schedule_1",
  isDefault: false,
  jitterMinutes: 60,
  name: "Daily",
  providerPolicy: null,
  publicId: scheduleId,
  serpDepth: 100,
  timeOfDay: null,
  timezone: "UTC",
};

describe("check schedule service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.checkSchedule.create.mockResolvedValue(schedule);
    mocks.tx.checkSchedule.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.checkSchedule.delete.mockResolvedValue(schedule);
    mocks.tx.keyword.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.$executeRaw.mockResolvedValue(0);
    mocks.tx.project.findUnique.mockResolvedValue({
      writeMode: "active",
      defaults: { timezone: "UTC" },
    });
    mocks.tx.$queryRaw.mockImplementation(async (parts: TemplateStringsArray) => {
      const sql = parts.join("?");
      if (sql.includes("FROM users")) return [{ id: "user_1" }];
      if (sql.includes("FROM memberships")) return [{ role: "admin" }];
      if (sql.includes('FROM "projects"')) return [{ id: "project_1" }];
      throw new Error(`Unexpected schedule authority query: ${sql}`);
    });
    mocks.tx.keyword.findMany.mockResolvedValue([]);
    mocks.refresh.mockResolvedValue(0);
    mocks.reconcile.mockResolvedValue({ deleted: 0 });
    mocks.writeAudit.mockResolvedValue({});
  });

  it.each(["deactivated", "removed_membership", "viewer"])(
    "refuses schedule updates for an actor whose fresh database authority is %s",
    async (reason) => {
      const original = mocks.tx.$queryRaw.getMockImplementation();
      if (!original) throw new Error("Missing original authority fixture.");
      mocks.tx.$queryRaw.mockImplementation(async (parts: TemplateStringsArray) => {
        const sql = parts.join("?");
        if (reason === "deactivated" && sql.includes("FROM users")) return [];
        if (reason === "removed_membership" && sql.includes("FROM memberships")) return [];
        if (reason === "viewer" && sql.includes("FROM memberships")) return [{ role: "viewer" }];
        return original(parts);
      });
      await expect(
        updateSchedule("user_1", "project_1", { projectId: `prj_${"p".repeat(24)}`, scheduleId }),
      ).rejects.toMatchObject({ code: "forbidden" });
      expect(mocks.tx.checkSchedule.findFirst).not.toHaveBeenCalled();
      expect(mocks.tx.checkSchedule.update).not.toHaveBeenCalled();
      expect(mocks.tx.keyword.updateMany).not.toHaveBeenCalled();
      expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
      expect(mocks.writeAudit).not.toHaveBeenCalled();
    },
  );
  it("refuses schedule updates while the locked project is read-only", async () => {
    mocks.tx.project.findUnique.mockResolvedValue({ writeMode: "migration_hold" });
    await expect(
      updateSchedule("user_1", "project_1", { projectId: `prj_${"p".repeat(24)}`, scheduleId }),
    ).rejects.toThrow("read-only");
    expect(mocks.tx.checkSchedule.findFirst).not.toHaveBeenCalled();
    expect(mocks.tx.checkSchedule.update).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
  it("creates a non-default schedule and audits inside the transaction", async () => {
    const result = await createSchedule("user_1", "project_1", {
      cronExpression: null,
      frequency: "daily",
      jitterMinutes: 60,
      name: "Daily",
      projectId: `prj_${"p".repeat(24)}`,
      timezone: "UTC",
    });

    expect(mocks.tx.checkSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ enabled: true, isDefault: false, projectId: "project_1" }),
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "check_schedule.create", targetType: "check_schedule" }),
      mocks.tx,
    );
    expect(mocks.writeAudit).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ publicId: scheduleId });
  });

  it("keeps project timezone inheritance when creating a schedule", async () => {
    mocks.tx.project.findUnique.mockResolvedValue({ defaults: { timezone: "Europe/Warsaw" } });
    await createSchedule("user_1", "project_1", {
      cronExpression: "0 6 * * 1",
      frequency: "weekly",
      jitterMinutes: 15,
      name: "Weekly · Mon 06:00",
      projectId: `prj_${"p".repeat(24)}`,
      timeOfDay: "06:00",
      timezone: null,
    });
    expect(mocks.tx.checkSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          timezone: null,
          jitterMinutes: 15,
          timeOfDay: "06:00",
          cronExpression: "0 6 * * 1",
        }),
      }),
    );
  });

  it("preserves calendar cron cadence when creating a weekly schedule", async () => {
    await createSchedule("user_1", "project_1", {
      cronExpression: "0 6 * * 5",
      frequency: "weekly",
      jitterMinutes: 60,
      name: "Friday",
      projectId: `prj_${"p".repeat(24)}`,
      timeOfDay: "06:00",
      timezone: "UTC",
    });

    expect(mocks.tx.checkSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cronExpression: "0 6 * * 5" }) }),
    );
  });

  it("clears and sets the default in one transaction", async () => {
    mocks.tx.checkSchedule.findFirst
      .mockResolvedValueOnce(schedule)
      .mockResolvedValueOnce({ publicId: `sch_${"a".repeat(24)}` });
    mocks.tx.checkSchedule.update.mockResolvedValue({ ...schedule, isDefault: true });

    await setDefaultSchedule("user_1", "project_1", scheduleId);

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.checkSchedule.updateMany).toHaveBeenCalledWith({
      data: { isDefault: false },
      where: { archivedAt: null, isDefault: true, projectId: "project_1" },
    });
    expect(mocks.tx.checkSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isDefault: true }, where: { id: "schedule_1" } }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "check_schedule.set_default",
        after: { publicId: scheduleId },
        before: { publicId: `sch_${"a".repeat(24)}` },
      }),
      mocks.tx,
    );
    expect(mocks.writeAudit).toHaveBeenCalledTimes(1);
  });

  it("rejects deletion of the default before any mutation", async () => {
    mocks.tx.checkSchedule.findFirst.mockResolvedValue({ ...schedule, isDefault: true });

    await expect(deleteSchedule("user_1", "project_1", scheduleId)).rejects.toBeInstanceOf(
      DefaultCheckScheduleDeletionError,
    );

    expect(mocks.tx.keyword.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.tx.checkSchedule.delete).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it.each([
    [
      "updates",
      () =>
        updateSchedule("user_1", "project_1", { projectId: `prj_${"p".repeat(24)}`, scheduleId }),
    ],
    ["sets default", () => setDefaultSchedule("user_1", "project_1", scheduleId)],
    ["deletes", () => deleteSchedule("user_1", "project_1", scheduleId)],
  ])("returns a typed not-found error when %s an unknown schedule", async (_operation, invoke) => {
    mocks.tx.checkSchedule.findFirst.mockResolvedValueOnce(null);

    await expect(invoke()).rejects.toBeInstanceOf(ApiNotFoundError);
    expect(mocks.tx.checkSchedule.update).not.toHaveBeenCalled();
    expect(mocks.tx.checkSchedule.delete).not.toHaveBeenCalled();
  });

  it("mirrors cadence updates to every member before refreshing dispatch state", async () => {
    const updated = { ...schedule, frequency: "weekly", jitterMinutes: 15 };
    mocks.tx.checkSchedule.findFirst.mockResolvedValue(schedule);
    mocks.tx.checkSchedule.update.mockResolvedValue(updated);
    mocks.tx.keyword.findMany.mockResolvedValue([{ id: "keyword_1" }, { id: "keyword_2" }]);

    await updateSchedule("user_1", "project_1", {
      frequency: "weekly",
      jitterMinutes: 15,
      projectId: `prj_${"p".repeat(24)}`,
      scheduleId,
    });

    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.tx.$executeRaw.mock.calls[0][0].values).toEqual(
      expect.arrayContaining(["weekly", 15]),
    );
    expect(mocks.refresh).toHaveBeenCalledWith(
      { keywordIds: ["keyword_1", "keyword_2"] },
      mocks.tx,
    );
    expect(mocks.reconcile).toHaveBeenCalledWith("schedule_1", mocks.tx, {
      invalidateMaterialized: true,
    });
    expect(mocks.tx.$executeRaw.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.refresh.mock.invocationCallOrder[0],
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "check_schedule.update" }),
      mocks.tx,
    );
    expect(mocks.writeAudit).toHaveBeenCalledTimes(1);
  });

  it("mirrors a disabled schedule as paused", async () => {
    mocks.tx.checkSchedule.findFirst.mockResolvedValue(schedule);
    mocks.tx.checkSchedule.update.mockResolvedValue({ ...schedule, enabled: false });
    mocks.tx.keyword.findMany.mockResolvedValue([{ id: "keyword_1" }]);

    await updateSchedule("user_1", "project_1", {
      enabled: false,
      projectId: `prj_${"p".repeat(24)}`,
      scheduleId,
    });

    expect(mocks.tx.$executeRaw.mock.calls[0][0].values).toEqual(
      expect.arrayContaining(["paused", null]),
    );
  });

  it("moves deleted-schedule members to the default and mirrors its cadence", async () => {
    const fallback = { ...schedule, id: "schedule_default", isDefault: true, publicId: fallbackId };
    mocks.tx.checkSchedule.findFirst
      .mockResolvedValueOnce(schedule)
      .mockResolvedValueOnce(fallback);
    mocks.tx.keyword.findMany.mockResolvedValue([{ id: "keyword_1", publicId: keywordId }]);

    await deleteSchedule("user_1", "project_1", scheduleId);

    expect(mocks.tx.keyword.updateMany).toHaveBeenCalledWith({
      data: { checkScheduleId: "schedule_default" },
      where: { id: { in: ["keyword_1"] } },
    });
    expect(mocks.tx.$executeRaw.mock.calls[0][0].values).toEqual(
      expect.arrayContaining(["daily", "keyword_1"]),
    );
    expect(mocks.refresh).toHaveBeenCalledWith({ keywordIds: ["keyword_1"] }, mocks.tx);
    expect(mocks.reconcile).toHaveBeenCalledWith("schedule_1", mocks.tx, { deleting: true });
    expect(mocks.reconcile).toHaveBeenCalledWith("schedule_default", mocks.tx);
    expect(mocks.tx.checkSchedule.delete).toHaveBeenCalledWith({ where: { id: "schedule_1" } });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "check_schedule.delete", targetType: "check_schedule" }),
      mocks.tx,
    );
    expect(mocks.writeAudit).toHaveBeenCalledTimes(1);
  });

  it("returns a typed not-found error when the default schedule is absent during deletion", async () => {
    mocks.tx.checkSchedule.findFirst.mockResolvedValueOnce(schedule).mockResolvedValueOnce(null);

    await expect(deleteSchedule("user_1", "project_1", scheduleId)).rejects.toBeInstanceOf(
      ApiNotFoundError,
    );
    expect(mocks.tx.checkSchedule.delete).not.toHaveBeenCalled();
  });

  it("reconciles planned runs when only time of day changes", async () => {
    mocks.tx.checkSchedule.findFirst.mockResolvedValue(schedule);
    mocks.tx.checkSchedule.update.mockResolvedValue({ ...schedule, timeOfDay: "06:00" });
    mocks.tx.keyword.findMany.mockResolvedValue([]);

    await updateSchedule("user_1", "project_1", {
      projectId: `prj_${"p".repeat(24)}`,
      scheduleId,
      timeOfDay: "06:00",
    });

    expect(mocks.reconcile).toHaveBeenCalledWith("schedule_1", mocks.tx, {
      invalidateMaterialized: true,
    });
  });
});
