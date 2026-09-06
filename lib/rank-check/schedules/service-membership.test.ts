import { ApiNotFoundError } from "@/lib/api/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assignKeywordsToSchedule,
  mirrorScheduleToKeywords,
  removeKeywordsFromSchedule,
} from "./service-membership";

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    checkSchedule: { findFirst: vi.fn() },
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
vi.mock("../planner/reconcile-schedule", () => ({
  reconcilePlannedRunsForSchedule: mocks.reconcile,
}));

const projectId = "project_1";
const scheduleAId = `sch_${"a".repeat(24)}` as `sch_${string}`;
const scheduleBId = `sch_${"b".repeat(24)}` as `sch_${string}`;
const kw1 = `kw_${"c".repeat(24)}` as `kw_${string}`;
const kw2 = `kw_${"d".repeat(24)}` as `kw_${string}`;
const kw3 = `kw_${"e".repeat(24)}` as `kw_${string}`;
const scheduleB = {
  cronExpression: null,
  enabled: true,
  frequency: "weekly" as const,
  id: "schedule_b",
  isDefault: false,
  jitterMinutes: 30,
  name: "Weekly",
  providerPolicy: null,
  publicId: scheduleBId,
  serpDepth: 100,
  timeOfDay: null,
  timezone: "Europe/Warsaw",
};

function sqlText(call: unknown[]) {
  return (call[0] as { strings: string[] }).strings.join("");
}

describe("check schedule membership service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.checkSchedule.findFirst.mockResolvedValue(scheduleB);
    mocks.tx.$executeRaw.mockResolvedValue(0);
    mocks.tx.keyword.updateMany.mockResolvedValue({ count: 0 });
    mocks.tx.project.findUnique.mockResolvedValue({ defaults: { timezone: "UTC" } });
    mocks.refresh.mockResolvedValue(0);
    mocks.reconcile.mockResolvedValue({ deleted: 0 });
    mocks.writeAudit.mockResolvedValue({});
  });

  it("moves exclusive membership, mirrors cadence, and audits previous schedules", async () => {
    mocks.tx.keyword.findMany.mockResolvedValue([
      {
        checkSchedule: { publicId: scheduleAId },
        checkScheduleId: "schedule_a",
        id: "keyword_1",
        publicId: kw1,
      },
      { checkSchedule: null, checkScheduleId: null, id: "keyword_2", publicId: kw2 },
      {
        checkSchedule: { publicId: scheduleBId },
        checkScheduleId: "schedule_b",
        id: "keyword_3",
        publicId: kw3,
      },
    ]);

    await assignKeywordsToSchedule("user_1", projectId, {
      keywordIds: [kw1, kw2, kw3],
      projectId: `prj_${"p".repeat(24)}`,
      scheduleId: scheduleBId,
    });

    expect(mocks.tx.keyword.updateMany).toHaveBeenCalledWith({
      data: { checkScheduleId: "schedule_b" },
      where: { id: { in: ["keyword_1", "keyword_2"] } },
    });
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledWith(
      { keywordIds: ["keyword_1", "keyword_2"] },
      mocks.tx,
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "check_schedule.assign",
        after: expect.objectContaining({ keywordIds: [kw1, kw2], movedFrom: [scheduleAId] }),
        targetType: "check_schedule",
      }),
      mocks.tx,
    );
    expect(mocks.writeAudit).toHaveBeenCalledTimes(1);
    expect(mocks.reconcile).toHaveBeenCalledWith("schedule_a", mocks.tx);
    expect(mocks.reconcile).toHaveBeenCalledWith("schedule_b", mocks.tx);
    expect(mocks.tx.$executeRaw.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.refresh.mock.invocationCallOrder[0],
    );
  });

  it("removes only members of the target and mirrors manual cadence", async () => {
    mocks.tx.keyword.findMany.mockResolvedValue([{ id: "keyword_1", publicId: kw1 }]);

    await removeKeywordsFromSchedule("user_1", projectId, {
      keywordIds: [kw1],
      projectId: `prj_${"p".repeat(24)}`,
      scheduleId: scheduleBId,
    });

    expect(mocks.tx.keyword.updateMany).toHaveBeenCalledWith({
      data: { checkScheduleId: null },
      where: { id: { in: ["keyword_1"] } },
    });
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.tx.$executeRaw.mock.calls[0][0].values).toContain("manual");
    expect(mocks.refresh).toHaveBeenCalledWith({ keywordIds: ["keyword_1"] }, mocks.tx);
    expect(mocks.reconcile).toHaveBeenCalledWith("schedule_b", mocks.tx);
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "check_schedule.remove", targetType: "check_schedule" }),
      mocks.tx,
    );
    expect(mocks.writeAudit).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "assigns",
      () =>
        assignKeywordsToSchedule("user_1", projectId, {
          keywordIds: [kw1],
          projectId: `prj_${"p".repeat(24)}`,
          scheduleId: scheduleBId,
        }),
    ],
    [
      "removes",
      () =>
        removeKeywordsFromSchedule("user_1", projectId, {
          keywordIds: [kw1],
          projectId: `prj_${"p".repeat(24)}`,
          scheduleId: scheduleBId,
        }),
    ],
  ])(
    "returns a typed not-found error when %s through an unknown schedule",
    async (_operation, invoke) => {
      mocks.tx.checkSchedule.findFirst.mockResolvedValueOnce(null);

      await expect(invoke()).rejects.toBeInstanceOf(ApiNotFoundError);
      expect(mocks.tx.keyword.updateMany).not.toHaveBeenCalled();
    },
  );

  it("batches cadence mirrors into 500-row upserts before one dispatch refresh", async () => {
    const keywordIds = Array.from({ length: 1_201 }, (_, index) => `keyword_${index}`);

    await mirrorScheduleToKeywords(mocks.tx as never, projectId, scheduleB, keywordIds);

    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(3);
    const batchSizes = mocks.tx.$executeRaw.mock.calls.map(
      ([statement]) =>
        statement.values.filter(
          (value: unknown) => typeof value === "string" && value.startsWith("keyword_"),
        ).length,
    );
    expect(batchSizes).toEqual([500, 500, 201]);
    for (const [batchIndex, call] of mocks.tx.$executeRaw.mock.calls.entries()) {
      const statement = call[0] as { strings: string[]; values: unknown[] };
      const text = sqlText(call);
      expect(text).toMatch(/INSERT INTO "keyword_schedules" \(\s*"id", "keywordId"/);
      expect(statement.values).toHaveLength(batchSizes[batchIndex] * 9);
      for (let offset = 0; offset < statement.values.length; offset += 9) {
        expect(statement.values[offset]).toEqual(expect.any(String));
        expect(statement.values[offset]).not.toHaveLength(0);
      }
      expect(text).toContain('ON CONFLICT ("keywordId") DO UPDATE');
      const updateClause = text.slice(text.indexOf("DO UPDATE SET"));
      expect(updateClause).not.toContain('"id"');
      expect(updateClause).not.toContain("serpDepth");
    }
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledWith({ keywordIds }, mocks.tx);
    expect(mocks.tx.$executeRaw.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.refresh.mock.invocationCallOrder[0],
    );
  });
});
