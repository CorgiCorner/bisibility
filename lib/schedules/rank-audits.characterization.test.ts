import { archiveSchedule, restoreSchedule } from "@/lib/rank-check/schedules/archive";
import { createSchedule, updateSchedule } from "@/lib/rank-check/schedules/service";
import {
  assignKeywordsToSchedule,
  removeKeywordsFromSchedule,
} from "@/lib/rank-check/schedules/service-membership";
import { beforeEach, describe, expect, it, vi } from "vitest";

const projectPublicId = `prj_${"p".repeat(24)}` as const;
const scheduleId = `sch_${"b".repeat(24)}` as const;
const keywordId = `kw_${"c".repeat(24)}` as const;
const schedule = {
  archivedAt: null as Date | null,
  cronExpression: null,
  enabled: true,
  frequency: "daily" as const,
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
const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    checkSchedule: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    keyword: { findMany: vi.fn(), updateMany: vi.fn() },
    keywordSchedule: { updateMany: vi.fn() },
    project: { findUnique: vi.fn() },
    projectDefaults: { upsert: vi.fn() },
  };
  return {
    audit: vi.fn(),
    prisma: { $transaction: vi.fn() },
    reconcile: vi.fn(),
    refresh: vi.fn(),
    tx,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.audit,
}));
vi.mock("@/lib/rank-check/dispatcher-state", () => ({
  refreshKeywordDispatchStates: mocks.refresh,
}));
vi.mock("@/lib/rank-check/planner/reconcile-schedule", () => ({
  reconcilePlannedRunsForSchedule: mocks.reconcile,
}));
vi.mock("@/lib/db/public-id", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/public-id")>()),
  makePublicId: () => `sch_${"z".repeat(24)}`,
}));

describe("rank schedule mutation audits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.checkSchedule.create.mockResolvedValue(schedule);
    mocks.tx.checkSchedule.findFirst.mockResolvedValue(schedule);
    mocks.tx.checkSchedule.update.mockImplementation(async ({ data }) => ({
      ...schedule,
      ...data,
    }));
    mocks.tx.checkSchedule.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.keyword.findMany.mockResolvedValue([]);
    mocks.tx.keyword.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.keywordSchedule.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.$executeRaw.mockResolvedValue(0);
    mocks.tx.project.findUnique.mockResolvedValue({
      defaults: { timezone: "UTC" },
      writeMode: "active",
    });
    mocks.tx.$queryRaw.mockImplementation(async (parts: TemplateStringsArray) => {
      const sql = parts.join("?");
      if (sql.includes("FROM users")) return [{ id: "user_1" }];
      if (sql.includes("FROM memberships")) return [{ role: "admin" }];
      if (sql.includes('FROM "projects"')) return [{ id: "project_1" }];
      return [{ id: "project_1" }];
    });
    mocks.refresh.mockResolvedValue(0);
    mocks.reconcile.mockResolvedValue({ deleted: 0 });
    mocks.audit.mockResolvedValue({});
  });

  it("audits rank create", async () => {
    await createSchedule("user_1", "project_1", {
      cronExpression: null,
      frequency: "daily",
      jitterMinutes: 60,
      name: "Daily",
      projectId: projectPublicId,
      timezone: "UTC",
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "check_schedule.create", targetType: "check_schedule" }),
      mocks.tx,
    );
  });

  it("audits rank update", async () => {
    await updateSchedule("user_1", "project_1", {
      name: "Renamed",
      projectId: projectPublicId,
      scheduleId,
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "check_schedule.update", targetType: "check_schedule" }),
      mocks.tx,
    );
  });

  it("audits rank archive and restore", async () => {
    await archiveSchedule("user_1", "project_1", {
      destinationScheduleId: null,
      scheduleId,
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "check_schedule.archive" }),
      mocks.tx,
    );
    mocks.audit.mockClear();
    mocks.tx.checkSchedule.findFirst.mockResolvedValue({
      ...schedule,
      archivedAt: new Date("2026-01-01T00:00:00Z"),
    });
    await restoreSchedule("user_1", "project_1", scheduleId);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "check_schedule.restore" }),
      mocks.tx,
    );
  });

  it("audits rank keyword assign and remove", async () => {
    mocks.tx.keyword.findMany.mockResolvedValue([
      { checkSchedule: null, checkScheduleId: null, id: "keyword_1", publicId: keywordId },
    ]);
    await assignKeywordsToSchedule("user_1", "project_1", {
      keywordIds: [keywordId],
      projectId: projectPublicId,
      scheduleId,
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "check_schedule.assign" }),
      mocks.tx,
    );
    mocks.audit.mockClear();
    mocks.tx.keyword.findMany.mockResolvedValue([{ id: "keyword_1", publicId: keywordId }]);
    await removeKeywordsFromSchedule("user_1", "project_1", {
      keywordIds: [keywordId],
      projectId: projectPublicId,
      scheduleId,
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "check_schedule.remove" }),
      mocks.tx,
    );
  });
});
