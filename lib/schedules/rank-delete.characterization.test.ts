import { deleteSchedule } from "@/lib/rank-check/schedules/service";
import { beforeEach, expect, it, vi } from "vitest";

const scheduleId = `sch_${"b".repeat(24)}`;
const schedule = {
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
    checkSchedule: { delete: vi.fn(), findFirst: vi.fn() },
    keyword: { findMany: vi.fn() },
    project: { findUnique: vi.fn() },
  };
  return { audit: vi.fn(), prisma: { $transaction: vi.fn() }, reconcile: vi.fn(), tx };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.audit,
}));
vi.mock("@/lib/rank-check/planner/reconcile-schedule", () => ({
  reconcilePlannedRunsForSchedule: mocks.reconcile,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
  mocks.tx.$queryRaw.mockResolvedValue([{ id: "project_1" }]);
  mocks.tx.project.findUnique.mockResolvedValue({ isSample: false, ownerId: "owner_1" });
  mocks.tx.checkSchedule.findFirst.mockResolvedValue(schedule);
  mocks.tx.checkSchedule.delete.mockResolvedValue(schedule);
  mocks.tx.keyword.findMany.mockResolvedValue([]);
  mocks.audit.mockResolvedValue({});
});

it("refuses a non-empty rank delete before audit or removal", async () => {
  mocks.tx.keyword.findMany.mockResolvedValue([{ id: "keyword_1" }]);
  await expect(deleteSchedule("user_1", "project_1", scheduleId)).rejects.toMatchObject({
    code: "check_schedule_not_empty",
  });
  expect(mocks.tx.checkSchedule.delete).not.toHaveBeenCalled();
  expect(mocks.reconcile).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
});

it("deletes an empty rank schedule and audits check_schedule.delete", async () => {
  await expect(deleteSchedule("user_1", "project_1", scheduleId)).resolves.toEqual({
    deleted: true,
  });
  expect(mocks.tx.checkSchedule.delete).toHaveBeenCalledWith({ where: { id: "schedule_1" } });
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "check_schedule.delete",
      actorId: "user_1",
      projectId: "project_1",
      targetType: "check_schedule",
    }),
    mocks.tx,
  );
});
