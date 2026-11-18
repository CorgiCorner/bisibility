import { ScheduleTransitionError } from "@/lib/schedules/errors";
import { setScheduleState } from "@/lib/schedules/mutations";
import { WEB_UNGATED_REVIEW } from "@/lib/schedules/review-commit";
import { beforeEach, expect, it, vi } from "vitest";

const projectPublicId = `prj_${"p".repeat(24)}` as const;
const scheduleId = `sch_${"b".repeat(24)}` as const;
const actor = { id: "user_1", memberships: [] };
const schedule = {
  archivedAt: new Date("2026-01-01T00:00:00Z"),
  cronExpression: null,
  enabled: false,
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
    checkSchedule: { findFirst: vi.fn(), update: vi.fn() },
    keyword: { findMany: vi.fn(), updateMany: vi.fn() },
    project: { findUnique: vi.fn() },
  };
  return { audit: vi.fn(), prisma: { $transaction: vi.fn() }, reconcile: vi.fn(), tx };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { ...mocks.prisma, checkSchedule: { findFirst: mocks.tx.checkSchedule.findFirst } },
}));
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
  mocks.tx.checkSchedule.findFirst.mockResolvedValue(schedule);
  mocks.tx.checkSchedule.update.mockImplementation(async ({ data }) => ({ ...schedule, ...data }));
  mocks.tx.keyword.findMany.mockResolvedValue([]);
  mocks.tx.project.findUnique.mockResolvedValue({
    defaults: { timezone: "UTC" },
    writeMode: "active",
  });
  mocks.tx.$executeRaw.mockResolvedValue(0);
  mocks.tx.$queryRaw.mockResolvedValue([{ id: "project_1", role: "admin" }]);
  mocks.audit.mockResolvedValue({});
  mocks.reconcile.mockResolvedValue({ deleted: 0 });
});

it("loads the archived rank row and restores it to paused", async () => {
  await setScheduleState(
    "project_1",
    actor,
    scheduleId,
    "paused",
    {
      kind: "rank",
      projectPublicId,
      restore: true,
    },
    WEB_UNGATED_REVIEW,
  );
  expect(mocks.tx.checkSchedule.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: { archivedAt: null, enabled: false } }),
  );
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({ action: "check_schedule.restore" }),
    mocks.tx,
  );
});

it("does not restore an archived rank row when pause omits the restore flag", async () => {
  await expect(
    setScheduleState(
      "project_1",
      actor,
      scheduleId,
      "paused",
      {
        kind: "rank",
        projectPublicId,
      },
      WEB_UNGATED_REVIEW,
    ),
  ).rejects.toBeInstanceOf(ScheduleTransitionError);
  expect(mocks.tx.checkSchedule.update).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
});

it("refuses to activate an archived rank row from its stored state", async () => {
  await expect(
    setScheduleState(
      "project_1",
      actor,
      scheduleId,
      "active",
      {
        kind: "rank",
        projectPublicId,
      },
      WEB_UNGATED_REVIEW,
    ),
  ).rejects.toBeInstanceOf(ScheduleTransitionError);
  expect(mocks.tx.checkSchedule.update).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
});
